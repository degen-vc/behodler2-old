// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
import "./FlashLoanArbiter.sol";
import "../openzeppelin/Ownable.sol";
import "../openzeppelin/SafeMath.sol";
import "../openzeppelin/IERC20.sol";

contract TokenHODLFlashLoanArbiter is FlashLoanArbiter,Ownable {
     using SafeMath for uint;
     IERC20 token;
     uint holdRatio; //0-100
     function setToken (address tkn) public onlyOwner {
         token = IERC20(tkn);
     }

     function setHoldRatio(uint ratio) public onlyOwner {
         require (ratio <=100, "FLASHLOANS: ratio < 100");
         holdRatio = ratio;
     }

     function canBorrow (address borrower) public view override returns (bool){
         return token.balanceOf(borrower).mul(100).div(token.totalSupply())>=holdRatio;  
     }
}