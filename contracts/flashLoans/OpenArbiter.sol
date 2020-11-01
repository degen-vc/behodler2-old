// SPDX-License-Identifier: MIT
pragma solidity ^0.7.1;
import "./FlashLoanArbiter.sol";
import "../openzeppelin/SafeMath.sol";

//stand in until a better scheme enabled.
contract OpenArbiter is FlashLoanArbiter{
    function canBorrow (address borrower) public pure override returns (bool){
        return true;
    }
}