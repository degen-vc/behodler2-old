// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
import "../flashLoans/FlashLoanReceiver.sol";

 contract InertFlashLoanReceiver is FlashLoanReceiver {
    function execute (address caller) public override {

    }
}