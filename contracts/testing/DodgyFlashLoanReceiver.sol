// SPDX-License-Identifier: MIT
pragma solidity ^0.7.1;
import "../flashLoans/FlashLoanReceiver.sol";
import "../openzeppelin/IERC20.sol";

 contract DodgyFlashLoanReceiver is FlashLoanReceiver {
    address scx;
    address sender;
    constructor (address _scx, address recipient){
        scx = _scx;
        sender =recipient;
    }
    function execute () public override {
        IERC20(scx).transfer(sender,1);
    }
}