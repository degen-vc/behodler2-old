// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

abstract contract FlashLoanReceiver {
    function execute (address caller) public virtual;
}