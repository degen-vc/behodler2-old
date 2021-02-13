// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
import "../flashLoans/FlashLoanArbiter.sol";
import "../openzeppelin/SafeMath.sol";

//stand in until a better scheme enabled.
contract MockRejectionArbiter is FlashLoanArbiter{
    function canBorrow (address borrower) public pure override returns (bool){
        return false;
    }
}