// SPDX-License-Identifier: MIT
pragma solidity ^0.7.1;
import "./FlashLoanArbiter.sol";
import "../openzeppelin/Ownable.sol";
import "../openzeppelin/SafeMath.sol";

interface ERC20{
    function balanceOf(address holder) external virtual view returns (uint);
    function totalSupply() external virtual view returns (uint);
}

contract TokenHODLFlashLoanArbiter is FlashLoanArbiter,Ownable {
     using SafeMath for uint;
     ERC20 token;
     uint holdRatio; //0-100
     function setToken (address tkn) public onlyOwner {
         token = ERC20(tkn);
     }

     function setHoldRatio(uint ratio) public onlyOwner {
         require (ratio <=100, "FLASHLOANS: ratio < 100")
         holdRatio = ratio;
     }

     function canBorrow (address borrower) public override returns (bool){
         return token.balanceOf(borrower).mul(100).div(token.totalSupply())>=holdRatio;  
     }
}