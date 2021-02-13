// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
import "../flashLoans/FlashLoanReceiver.sol";
import "../openzeppelin/IERC20.sol";

 contract DodgyFlashLoanReceiver is FlashLoanReceiver {
    address scx;
    constructor (address _scx){
        scx = _scx;
    }
    function execute (address caller) public override {
        IERC20(scx).transfer(caller,1);
    }
}