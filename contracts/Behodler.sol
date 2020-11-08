// SPDX-License-Identifier: MIT
pragma solidity ^0.7.1;

import "./openzeppelin/Ownable.sol";
import "./Scarcity.sol";
import "./facades/LachesisLike.sol";
import "./facades/Burnable.sol";
import "./openzeppelin/SafeMath.sol";
import "./openzeppelin/IERC20.sol";
import "./flashLoans/FlashLoanReceiver.sol";
import "./flashLoans/FlashLoanArbiter.sol";

interface IWeth {
    function deposit() external payable;

    function withdraw(uint256 value) external;
}

library AddressBalanceCheck {
    function tokenBalance(address token) public view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function transferIn(
        address token,
        address sender,
        uint256 value
    ) public {
        IERC20(token).transferFrom(sender, address(this), value);
    }

    function transferOut(
        address token,
        address recipient,
        uint256 value
    ) public {
        IERC20(token).transfer(recipient, value);
    }
}

library CommonMath {
    function square(uint256 num) public pure returns (uint256) {
        return num * num;
    }
}

/*
	Behodler orchestrates trades using an omnischedule bonding curve.
	The name is inspired by the Beholder of D&D, a monster with multiple arms ending in eyes peering in all directions.
	The Behodler is a smart contract that can see the prices of all tokens simultaneously without need for composition or delay.
	The hodl part of Behodler refers to the fact that with every trade of a token pair, the liquidity pool of each token held by Behodler increases

    Behodler 1 performed square root calculations which are gas intensive for fixed point arithmetic algorithms. 
    To save gas, Behodler2 never performs square root calculations. It just checks the numbers passed in by the user and reverts if needs be. 
    This techique is called invariant checking and offloads maximum calculation to clients while guaranteeing no cheating is possible.
    In Behodler 1 some operations were duplicated. For instance, a swap was a scarcity purchase followed by a scarcity sale. Instead, cutting out 
    the middle scarcity allows the factor scaling to be dropped altogether.

    By bringing Scarcity, Janus, Kharon and Behodler together in one contract, Behodler 2 avoids the EXT_CALL gas fees and can take gas saving shortcuts with Scarcity
    transfers. The drawback to this approach is less flexibility with fees in the way that Kharon allowed.

    Behodler 2 now has Flashloan support. Instead of charging a liquidity growing fee, Behodler 2 requires the user fulfil some requirement 
    such as holding an NFT or staking Scarcity. This allows for zero fee flash loans while still benefiting the ecosystem.
    
 */
contract Behodler is Scarcity {
    using SafeMath for uint256;
    using CommonMath for uint256;
    using AddressBalanceCheck for address;

    event LiquidityAdded(
        address sender,
        address token,
        uint256 tokenValue,
        uint256 scx
    );
    event LiquidityWithdrawn(
        address recipient,
        address token,
        uint256 tokenValue,
        uint256 scx
    );
    event Swap(
        address sender,
        address inputToken,
        address outputToken,
        uint256 inputValue,
        uint256 outputValue
    );

    struct TokenValues {
        uint256 initialInputBalance;
        uint256 amountToTransferIn;
        uint256 amountToTransferOut;
    }

    address public Weth;
    address public Lachesis;
    FlashLoanArbiter public arbiter;
    address private inputSender;
    uint256 public constant factor = 64;
    uint256 public constant root_factor = 32;
    bool unlocked = true;

    function seed(
        address weth,
        address lachesis,
        address flashLoanArbiter
    ) public onlyOwner {
        Weth = weth;
        Lachesis = lachesis;
        arbiter = FlashLoanArbiter(flashLoanArbiter);
    }

    //MIN_LIQUIDITY is mainly for fixed point rounding errors. Infinitesimal tokens are rejected.
    //Keep in mind a typical ERC20 has 59 bits after the point. Bitcoin has 26.
    uint256 public constant MIN_LIQUIDITY = 1 << 17;

    mapping(address => bool) public tokenBurnable;
    mapping(address => bool) public validTokens;

    modifier onlyLachesis {
        require(msg.sender == Lachesis);
        _;
    }

    modifier onlyValidToken(address token) {
        require(
            validTokens[token] || (token != address(0) && token == Weth),
            "BEHODLER: token invalid"
        );
        _;
    }

    modifier determineSender(address inputToken) {
        if (msg.value > 0) {
            require(
                inputToken == Weth,
                "BEHODLER: Eth only valid for Weth trades."
            );
            inputSender = address(this);
        } else {
            inputSender = msg.sender;
        }
        _;
    }

    modifier lock {
        require(unlocked, "BEHODLER: Reentrancy guard active.");
        unlocked = false;
        _;
        unlocked = true;
    }

    function swap(
        address inputToken,
        address outputToken,
        uint256 rootInitialInputBalance,
        uint256 rootFinalInputBalanceBeforeBurn,
        uint256 rootFinalInputBalance,
        uint256 rootInitialOutputBalance,
        uint256 rootFinalOutputBalanceBeforeSCXBurn,
        uint256 rootFinalOutputBalance
    )
        public
        payable
        determineSender(inputToken)
        onlyValidToken(inputToken)
        lock
        returns (bool success)
    {
        //balance invariant checks
        rootInvariantCheck(
            inputToken.tokenBalance(),
            rootInitialOutputBalance,
            "BEHODLER: invariant swap input 1"
        );
        if (inputToken == Weth) IWeth(Weth).deposit{value: msg.value}();
        rootInvariantCheck(
            outputToken.tokenBalance(),
            rootInitialOutputBalance,
            "BEHODLER: invariant swap output 1"
        );
        require(
            rootFinalOutputBalance > rootFinalOutputBalanceBeforeSCXBurn,
            "BEHODLER: output leakage check"
        );
        require(
            rootFinalInputBalance.sub(rootInitialInputBalance) ==
                rootInitialOutputBalance.sub(rootFinalOutputBalance),
            "BEHODLER: swap invariant I/O"
        );

        //Avoid stack too deep error
        TokenValues memory tokenValues;

        (
            tokenValues.initialInputBalance,
            tokenValues.amountToTransferIn,
            tokenValues.amountToTransferOut
        ) = getTokenValues(
            rootInitialInputBalance,
            rootFinalInputBalanceBeforeBurn,
            rootInitialOutputBalance,
            rootFinalOutputBalance
        );

        //transfer input token to Behodler
        inputToken.transferIn(inputSender, tokenValues.amountToTransferIn);

        //check that net input after burning is correctly calculated by user.
        require(
            tokenValues.amountToTransferIn -
                burnIfPossible(inputToken, tokenValues.amountToTransferIn) -
                rootFinalInputBalance.square() -
                tokenValues.initialInputBalance <
                MIN_LIQUIDITY,
            "BEHODLER: swap invariant in"
        );

        uint256 scarcityFeePercentage = (
            rootFinalOutputBalanceBeforeSCXBurn.sub(rootFinalOutputBalance)
        )
            .mul(1000)
            .div(
            rootInitialOutputBalance.sub(rootFinalOutputBalanceBeforeSCXBurn)
        );

        require(
            scarcityFeePercentage == config.burnFee,
            "BEHODLER: Scarcity burn fee invariant"
        );

        outputToken.transferOut(msg.sender, tokenValues.amountToTransferOut);

        emit Swap(
            msg.sender,
            inputToken,
            outputToken,
            tokenValues.amountToTransferIn,
            tokenValues.amountToTransferOut
        );
        success = true;
    }

    //Low level function
    function addLiquidity(
        address inputToken,
        uint256 amount,
        uint256 rootInitialBalance,
        uint256 rootFinalBalanceBeforeBurn,
        uint256 rootFinalBalanceAfterBurn
    )
        public
        payable
        determineSender(inputToken)
        onlyValidToken(inputToken)
        lock
        returns (uint256)
    {
        uint256 initialBalance = inputToken.tokenBalance();
        //invariants on the input parameters are checked.
        rootInvariantCheck(
            initialBalance,
            rootInitialBalance,
            "BEHODLER: invariant liquidity balance 1"
        );

        require(
            rootFinalBalanceBeforeBurn >= rootFinalBalanceAfterBurn,
            "BEHODLER: burn parameters invariant."
        );
        if (inputToken == Weth) {
            IWeth(Weth).deposit{value: msg.value}();
        } else {
            inputToken.transferIn(inputSender, amount);
        }

        uint256 balanceAfterBurn = amount -
            burnIfPossible(inputToken, amount) +
            initialBalance;
        require(
            balanceAfterBurn > MIN_LIQUIDITY,
            "BEHODLER: minimum liquidity"
        );

        rootInvariantCheck(
            balanceAfterBurn,
            rootFinalBalanceAfterBurn,
            "BEHODLER: liquidity burn invariant"
        );

        //Scarcity minted and sent to user.
        uint256 deltaScarcity = (rootFinalBalanceAfterBurn -
            rootInitialBalance) << root_factor;
        mint(msg.sender, deltaScarcity);
        emit LiquidityAdded(msg.sender, inputToken, amount, deltaScarcity);
        return deltaScarcity;
    }

    //Low level function
    function withdrawLiquidity(
        address outputToken,
        uint256 amount,
        uint256 rootInitialBalance,
        uint256 rootFinalBalance,
        uint256 rootFinalBalanceBeforeBurn
    ) public returns (uint256 tokensToRelease) {
        uint256 outputTokenBalance = outputToken.tokenBalance();
        rootInvariantCheck(
            outputTokenBalance,
            rootInitialBalance,
            "BEHODLER: invariant liquidity balance 2"
        );
        require(
            rootFinalBalanceBeforeBurn < rootFinalBalance,
            "BEHODLER: Scarcity burn invariance check"
        );

        //Transfer and burn Scarcity
        uint256 scarcityToBurn = config.burnFee.mul(amount).div(1000);

        _balances[msg.sender] = _balances[msg.sender].sub(
            amount,
            "BEHODLER: insufficient Scarcity to withdraw"
        );
        _totalSupply = _totalSupply.sub(amount);

        //invariant on user input
        //precision errors imply we sometimes only approach the true value
        uint256 scarcityMinusBurn1 = (rootInitialBalance -
            (rootFinalBalance + 1)) << root_factor;
        uint256 scarcityMinusBurn2 = (rootInitialBalance -
            (rootFinalBalance - 1)) << root_factor;
        require(scarcityMinusBurn1 < scarcityMinusBurn2);
        require(
            amount.sub(scarcityMinusBurn1) >= scarcityToBurn &&
                amount.sub(scarcityMinusBurn2) <= scarcityToBurn,
            "BEHODLER: Scarcity burnt invariant"
        );

        tokensToRelease = rootInitialBalance.square().sub(rootFinalBalance.square());

        if (outputToken == Weth) {
            IWeth(Weth).withdraw(tokensToRelease);
            address payable sender = msg.sender;
            (bool unwrapped, ) = sender.call{value: tokensToRelease}("");
            require(unwrapped, "BEHODLER: Unwrapping of Weth failed.");
        } else {
            outputToken.transferOut(msg.sender, tokensToRelease);
        }
        emit LiquidityWithdrawn(
            msg.sender,
            outputToken,
            tokensToRelease,
            amount
        );
    }

    //zero fee flashloan. All that is required is for an arbiter to decide if user can borrow
    //example: a user must hold 10% of SCX total supply or user must hold an NFT
    //The initial arbiter will have no constraints.
    function grantFlashLoan(
        address tokenRequested,
        uint256 liquidity,
        address flashLoanContract
    ) public lock {
        require(
            arbiter.canBorrow(msg.sender),
            "BEHODLER: cannot borrow flashloan"
        );
        uint256 balanceBefore = tokenRequested.tokenBalance();
        tokenRequested.transferOut(flashLoanContract, liquidity);
        FlashLoanReceiver(flashLoanContract).execute();
        uint256 balanceAfter = tokenRequested.tokenBalance();
        require(balanceAfter == balanceBefore, "Flashloan repayment failed.");
    }

    function burnIfPossible(address token, uint256 amount)
        private
        returns (uint256 burnt)
    {
        if (tokenBurnable[token]) burnt = burnFee(token, amount);
    }

    function rootInvariantCheck(
        uint256 actual,
        uint256 rootParameter,
        string memory error
    ) private pure {
        require(
            actual >= (rootParameter.square()) &&
                actual < (rootParameter + 1).square(),
            error
        );
    }

    function setValidToken(
        address token,
        bool valid,
        bool burnable
    ) public onlyLachesis {
        validTokens[token] = valid;
        tokenBurnable[token] = burnable;
    }

    function getTokenValues(
        uint256 rootInitialInputBalance,
        uint256 rootFinalInputBalanceBeforeBurn,
        uint256 rootInitialOutputBalance,
        uint256 rootFinalOutputBalance
    )
        public
        pure
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        uint256 initial = rootInitialInputBalance.square();
        uint256 input = rootFinalInputBalanceBeforeBurn.square().sub(initial);
        uint256 output = rootInitialOutputBalance.square().sub(
            rootFinalOutputBalance.square()
        );
        return (initial, input, output);
    }
}
