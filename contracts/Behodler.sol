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

    Behodler 1 performed square root calculations which are tedious and gas intensive for fixed point arithmetic algorithms. 
    To save gas, Behodler2 never performs square root calculations. It just checks the numbers passed in by the user and reverts if needs be. 
    This techique is called invariant checking and offloads maximum calculation to clients while guaranteeing no cheating is possible.
    Operations were also duplicated. For instance, a swap was a scarcity purchase followed by a scarcity sale. Instead, cutting out 
    the middle scarcity allows the factor scaling to be dropped altogether.
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
    bool locked = false;

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
        require(validTokens[token], "BEHODLER: token invalid");
        _;
    }

    modifier determineSender(address inputToken) {
        require(!locked, "BEHODLER: Reentrancy guard active.");
        locked = true;
        if (msg.value > 0) {
            require(
                inputToken == Weth,
                "BEHODLER: Eth only valid for Weth trades."
            );
            IWeth(Weth).deposit{value: msg.value}();
            inputSender = address(this);
        } else {
            inputSender = msg.sender;
        }
        _;
        locked = false;
    }

    modifier lock {
        require(!locked, "BEHODLER: Reentrancy guard active.");
        locked = true;
        _;
        locked = false;
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
    ) public payable determineSender(inputToken) onlyValidToken(inputToken) returns (bool success) {
        //balance invariant checks
        balanceInvariantCheck(
            inputToken.tokenBalance(),
            rootInitialOutputBalance
        );
        balanceInvariantCheck(
            outputToken.tokenBalance(),
            rootInitialOutputBalance
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

    //Low level function: To save gas, Behodler never performs square root calculations. It just checks the calculations and reverts if needs be.
    function addLiquidity(
        address inputToken,
        uint256 rootInitialBalance,
        uint256 rootFinalBalanceBeforeBurn,
        uint256 rootFinalBalanceAfterBurn
    ) public payable determineSender(inputToken) onlyValidToken(inputToken) returns (bool success) {
        //invariants on the input parameters are checked.
        balanceInvariantCheck(inputToken.tokenBalance(), rootInitialBalance);
        require(
            rootFinalBalanceBeforeBurn >= rootFinalBalanceAfterBurn,
            "BEHODLER: burn parameters invariant."
        );

        //token transferred to Behodler and burnt if burnable.
        uint256 initialTransferAmount = rootFinalBalanceBeforeBurn.square().sub(
            rootInitialBalance.square()
        );
        inputToken.transferIn(inputSender, initialTransferAmount);
        uint256 balanceAfterBurn = initialTransferAmount -
            burnIfPossible(inputToken, initialTransferAmount);
        require(
            balanceAfterBurn > MIN_LIQUIDITY,
            "BEHODLER: minimum liquidity"
        );
        require(
            balanceAfterBurn - (rootFinalBalanceAfterBurn.square()) <
                MIN_LIQUIDITY,
            "BEHODLER: burn effect invariant"
        );

        //Scarcity minted and sent to user.
        uint256 deltaScarcity = (rootFinalBalanceAfterBurn -
            rootInitialBalance) << root_factor;
        mint(msg.sender, deltaScarcity);
        emit LiquidityAdded(
            msg.sender,
            inputToken,
            initialTransferAmount,
            deltaScarcity
        );
        success = true;
    }

    //Low level function
    function withdrawLiquidity(
        address outputToken,
        uint256 rootInitialBalance,
        uint256 rootFinalBalance,
        uint256 rootFinalBalanceBeforeBurn
    ) public returns (bool success) {
        balanceInvariantCheck(outputToken.tokenBalance(), rootInitialBalance);
        require(
            rootFinalBalanceBeforeBurn < rootFinalBalance,
            "BEHODLER: Scarcity burn invariance check"
        );
        uint256 deltaRootBalance = rootInitialBalance.sub(
            rootFinalBalanceBeforeBurn,
            "BEHODLER: widthdrawal balance must diminish"
        );

        //Transfer and burn Scarcity
        uint256 scarcityTransferAmount = deltaRootBalance << root_factor;
        uint256 scarcityToBurn = config.burnFee.mul(scarcityTransferAmount).div(
            1000
        );
        _balances[msg.sender] = _balances[msg.sender].sub(
            scarcityTransferAmount,
            "BEHODLER: insufficient Scarcity to withdraw"
        );
        _totalSupply = _totalSupply.sub(scarcityTransferAmount);

        //invariant on user input
        uint256 scarcityMinusBurn = (rootFinalBalance - rootInitialBalance) <<
            root_factor;
        require(
            scarcityTransferAmount.sub(scarcityMinusBurn) == scarcityToBurn,
            "BEHODLER: Scarcity burnt invariant"
        );

        //release tokens to user
        uint256 tokensToRelease = (
            outputToken.tokenBalance().sub(rootFinalBalance.square())
        );

        if(outputToken == Weth) {
             IWeth(Weth).withdraw(tokensToRelease);
             address payable sender = msg.sender;
		    (bool unwapped, ) = sender.call{value:tokensToRelease}("");
		    require(unwapped, "BEHODLER: Unwrapping of Weth failed.");
        }else {
            outputToken.transferOut(msg.sender, tokensToRelease);
        }
        emit LiquidityWithdrawn(
            msg.sender,
            outputToken,
            tokensToRelease,
            scarcityTransferAmount
        );
        success = true;
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

    function balanceInvariantCheck(uint256 actual, uint256 rootParameter)
        private
        pure
    {
        require(
            actual - (rootParameter * rootParameter) < MIN_LIQUIDITY,
            "BEHODLER: balance invariant."
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
