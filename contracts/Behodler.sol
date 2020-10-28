// SPDX-License-Identifier: MIT
pragma solidity ^0.7.1;

import "./openzeppelin/Ownable.sol";
import "./Scarcity.sol";
import "./facades/LachesisLike.sol";
import "./facades/Burnable.sol";
import "./openzeppelin/SafeMath.sol";
import "./openzeppelin/IERC20.sol";

contract Behodler is Scarcity {
    using SafeMath for uint;

    event liquidityAdded(address sender, address token, uint tokenValue, uint scx);
    event liquidityWithdrawn(address token, uint tokenValue, uint scx);
    event swap (address inputToken, address outputToken, uint inputValue, uint outputValue);

    address public Weth;
    address public Lachesis;
    uint constant public factor = 64;
    uint constant public root_factor = 32;

    //MIN_LIQUIDITY is mainly for fixed point rounding errors. Infinitesimal tokens are rejected. 
    //Keep in mind a typical ERC20 has 59 bits after the point. Bitcoin has 26.
    uint constant public MIN_LIQUIDITY = 1<<19;

    mapping (address=>bool) public tokenBurnable;
    mapping (address=>bool) public validTokens;
    mapping(address=>uint) public leakage;

    modifier onlyLachesis {
        require(msg.sender == Lachesis);
        _;
    }

    modifier onlyValidToken(address token){
        require(validTokens[token],"BEHODLER: token invalid");
        _;
    }

    function setValidToken (address token, bool valid, bool burnable) public onlyLachesis {
        validTokens[token] = valid;
        tokenBurnable[token] = burnable;
    }

    //Low level function: To save gas, Behodler never performs square root calculations. It just checks the calculations and reverts if needs be. 
    function addLiquidity (address inputToken, uint rootInitialBalance,uint rootFinalBalanceBeforeBurn, uint rootFinalBalanceAfterBurn) public onlyValidToken(inputToken) returns (bool success) {
        //invariant checks on the input parameters are checked. 
        uint balance = IERC20(inputToken).balanceOf(address(this));
        require(balance - (rootInitialBalance * rootInitialBalance) < MIN_LIQUIDITY,"BEHODLER: balance invariant check.");
        require(rootFinalBalanceBeforeBurn>=rootFinalBalanceAfterBurn, "BEHODLER: burn parameters invariant check.");
        uint deltaRootBalance = rootFinalBalanceBeforeBurn.sub(rootInitialBalance);
        
        //token transferred to Behodler and burnt if burnable. 
        uint initialTransferAmount = deltaRootBalance * deltaRootBalance;
        IERC20(inputToken).transferFrom(msg.sender, address(this),initialTransferAmount);
        uint balanceAfterBurn = initialTransferAmount - burnIfPossible(inputToken, initialTransferAmount);
        require(balanceAfterBurn > MIN_LIQUIDITY, "BEHODLER: minimum liquidity");
        require (balanceAfterBurn - (rootFinalBalanceAfterBurn * rootFinalBalanceAfterBurn) < MIN_LIQUIDITY, "BEHODLER: burn effect invariant check");

        //Scarcity minted and sent to user.
        uint deltaScarcity = (rootFinalBalanceAfterBurn - rootInitialBalance)<<root_factor;
        mint(msg.sender,deltaScarcity);
        success = true;
    }

    function burnIfPossible(address token, uint amount) private returns (uint burnt){
        if(tokenBurnable[token]) burnt = burnFee(token,amount);
    }
}