// SPDX-License-Identifier: MIT
pragma solidity ^0.7.1;
import "../openzeppelin/IERC20.sol";

abstract contract PyroTokenLike {
    function baseToken() public virtual returns (address);
}
contract LiquidityReceiver {
    function drain (address pyroToken) public {
        address self = address(this);
        address baseToken = PyroTokenLike(pyroToken).baseToken();
        uint balance = IERC20(baseToken).balanceOf(self);
        IERC20(baseToken).transfer(pyroToken,balance);
    }
}