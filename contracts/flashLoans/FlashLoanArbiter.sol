// SPDX-License-Identifier: MIT
pragma solidity ^0.7.1;

abstract contract FlashLoanArbiter {
    function canBorrow (address borrower) public virtual returns (bool);
}