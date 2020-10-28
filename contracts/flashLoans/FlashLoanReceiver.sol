// SPDX-License-Identifier: MIT
pragma solidity ^0.7.1;

contract abstract FlashLoanReceiver {
    function execute () public virtual;
}