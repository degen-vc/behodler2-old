// SPDX-License-Identifier: MIT
pragma solidity ^0.7.1;

import "./openzeppelin/Ownable.sol";
import "./Scarcity.sol";
import "./facades/LachesisLike.sol";
import "./facades/Burnable.sol";
import "./openzeppelin/SafeMath.sol";
import "./openzeppelin/IERC20.sol";

library AddressBalanceCheck {
    function tokenBalance(address token) public view returns (uint){
        return IERC20(token).balanceOf(address(this));
    }

    function transferIn(address token, address sender, uint value) public {
        IERC20(token).transferFrom(sender,address(this),value);
    }

    function transferOut(address token, address recipient, uint value) public {
        IERC20(token).transfer(recipient,value);
    }
}

library CommonMath{
    function square (uint num) public pure returns (uint) {
        return num * num;
    }
}

/*
	Behodler orchestrates trades using an omnischedule bonding curve.
	The name is inspired by the Beholder of D&D, a monster with multiple arms ending in eyes peering in all directions.
	The Behodler is a smart contract that can see the prices of all tokens simultaneously without need for composition or delay.
	The hodl part of Behodler refers to the fact that with every trade of a token pair, the liquidity pool of each token held by Behodler increases
 */
contract Behodler is Scarcity {
    using SafeMath for uint;
    using CommonMath for uint;
    using AddressBalanceCheck for address;

    event LiquidityAdded(address sender, address token, uint tokenValue, uint scx);
    event LiquidityWithdrawn(address recipient, address token, uint tokenValue, uint scx);
    event Swap (address sender, address inputToken, address outputToken, uint inputValue, uint outputValue);

    address public Weth;
    address public Lachesis;
    uint constant public factor = 64;
    uint constant public root_factor = 32;

    //MIN_LIQUIDITY is mainly for fixed point rounding errors. Infinitesimal tokens are rejected. 
    //Keep in mind a typical ERC20 has 59 bits after the point. Bitcoin has 26.
    uint constant public MIN_LIQUIDITY = 1<<17;

    mapping (address=>bool) public tokenBurnable;
    mapping (address=>bool) public validTokens;

    modifier onlyLachesis {
        require(msg.sender == Lachesis);
        _;
    }

    modifier onlyValidToken(address token){
        require(validTokens[token],"BEHODLER: token invalid");
        _;
    }

    function swap (address inputToken, 
                   address outputToken, 
                   uint rootInitialInputBalance,
                   uint rootFinalInputBalanceBeforeBurn,
                   uint rootFinalInputBalance,
                   uint rootInitialOutputBalance,
                   uint rootFinalOutputBalanceBeforeSCXBurn,
                   uint rootFinalOutputBalance) 
                   public 
                   onlyValidToken(inputToken)
                   returns (bool success)  {
        balanceInvariantCheck(inputToken.tokenBalance(), rootInitialOutputBalance);
        balanceInvariantCheck(outputToken.tokenBalance(), rootInitialInputBalance);
        require(rootFinalOutputBalanceBeforeSCXBurn > rootFinalOutputBalance, "BEHODLER: output leakage check");

        uint deltaRootOutputBalance = rootInitialOutputBalance.sub(rootFinalOutputBalanceBeforeSCXBurn);
        require(rootInitialInputBalance.sub(rootInitialInputBalance) == deltaRootOutputBalance, "BEHODLER: swap invariant");
       
        uint amountToTransferIn = rootFinalInputBalanceBeforeBurn.square().sub(rootInitialInputBalance.square());
        inputToken.transferIn(msg.sender,amountToTransferIn);
        
        require(amountToTransferIn - burnIfPossible(inputToken,amountToTransferIn) - rootFinalInputBalance.square() < MIN_LIQUIDITY, "BEHODLER: invariant swap in");

        uint ratio = deltaRootOutputBalance.sub(rootInitialOutputBalance.sub(rootFinalOutputBalance)).mul(1000).div(deltaRootOutputBalance);
        require(ratio == config.burnFee, "BEHODLER: Scarcity burn invariant check");

        uint amountToTransferOut = rootInitialOutputBalance.square().sub(rootFinalOutputBalance.square());
        outputToken.transferOut(msg.sender, amountToTransferOut);
    
        emit Swap(msg.sender, inputToken, outputToken,amountToTransferIn,amountToTransferOut);
        success = true;
    }

    //Low level function: To save gas, Behodler never performs square root calculations. It just checks the calculations and reverts if needs be. 
    function addLiquidity (address inputToken, uint rootInitialBalance,uint rootFinalBalanceBeforeBurn, uint rootFinalBalanceAfterBurn) public onlyValidToken(inputToken) returns (bool success) {
        //invariants on the input parameters are checked. 
        balanceInvariantCheck(inputToken.tokenBalance(), rootInitialBalance);
        require(rootFinalBalanceBeforeBurn>=rootFinalBalanceAfterBurn, "BEHODLER: burn parameters invariant.");

        //token transferred to Behodler and burnt if burnable. 
        uint initialTransferAmount = rootFinalBalanceBeforeBurn.square().sub(rootInitialBalance.square());
        inputToken.transferIn(msg.sender,initialTransferAmount);
        uint balanceAfterBurn = initialTransferAmount - burnIfPossible(inputToken, initialTransferAmount);
        require(balanceAfterBurn > MIN_LIQUIDITY, "BEHODLER: minimum liquidity");
        require (balanceAfterBurn - (rootFinalBalanceAfterBurn.square()) < MIN_LIQUIDITY, "BEHODLER: burn effect invariant");

        //Scarcity minted and sent to user.
        uint deltaScarcity = (rootFinalBalanceAfterBurn - rootInitialBalance)<<root_factor;
        mint(msg.sender,deltaScarcity);
        emit LiquidityAdded (msg.sender, inputToken, initialTransferAmount, deltaScarcity);
        success = true;
    }

    //Low level function: To save gas, Behodler never performs square root calculations. It just checks the calculations and reverts if needs be. 
    function withdrawLiquidity (address outputToken, uint rootInitialBalance, uint rootFinalBalance, uint rootFinalBalanceBeforeBurn) public returns (bool success) {
        balanceInvariantCheck(outputToken.tokenBalance(), rootInitialBalance);
        require (rootFinalBalanceBeforeBurn < rootFinalBalance, "BEHODLER: Scarcity burn invariance check");
        uint deltaRootBalance = rootInitialBalance.sub(rootFinalBalanceBeforeBurn,"BEHODLER: widthdrawal balance must diminish");
    
        //Transfer and burn Scarcity
        uint scarcityTransferAmount = deltaRootBalance << root_factor;
        uint scarcityToBurn = config.burnFee.mul(scarcityTransferAmount).div(1000);
        _balances[msg.sender] = _balances[msg.sender].sub(scarcityTransferAmount, "BEHODLER: insufficient Scarcity to withdraw");
        _totalSupply = _totalSupply.sub(scarcityTransferAmount);

        //invariant on user input
        uint scarcityMinusBurn = (rootFinalBalance - rootInitialBalance) << root_factor;
        require(scarcityTransferAmount.sub(scarcityMinusBurn) == scarcityToBurn, "BEHODLER: Scarcity burnt invariant" );
   
        //release tokens to user
        uint tokensToRelease = (outputToken.tokenBalance().sub(rootFinalBalance.square()));
        outputToken.transferOut(msg.sender,tokensToRelease);
        emit LiquidityWithdrawn(msg.sender, outputToken,tokensToRelease,scarcityTransferAmount);
        success = true;
    }

    function burnIfPossible(address token, uint amount) private returns (uint burnt){
        if(tokenBurnable[token]) burnt = burnFee(token,amount);
    }

    function balanceInvariantCheck (uint actual, uint rootParameter) private pure {
        require(actual - (rootParameter * rootParameter) < MIN_LIQUIDITY,"BEHODLER: balance invariant.");
    }

    function setValidToken (address token, bool valid, bool burnable) public onlyLachesis {
        validTokens[token] = valid;
        tokenBurnable[token] = burnable;
    }
}