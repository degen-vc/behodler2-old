// SPDX-License-Identifier: MIT
pragma solidity ^0.7.1;
import "../flashLoans/FlashLoanReceiver.sol";

interface IERC20{
    function transfer (address sender, uint value) external returns (bool);
}

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