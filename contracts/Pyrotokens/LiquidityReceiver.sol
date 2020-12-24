// SPDX-License-Identifier: MIT
pragma solidity ^0.7.1;
import "../openzeppelin/IERC20.sol";
import "../openzeppelin/Ownable.sol";

abstract contract PyroTokenLike {
    function baseToken() public virtual returns (address);
}
contract LiquidityReceiver is Ownable{

    mapping (address=>bool) public validPyrotokens;

    function registerPyroToken(address pyro, bool valid) public onlyOwner {
            validPyrotokens[pyro] = valid;
    }

    function drain (address pyroToken) public {
        require(validPyrotokens[pyroToken],"BEHODLER: pyrotoken not registered.");
        address self = address(this);
        address baseToken = PyroTokenLike(pyroToken).baseToken();
        uint balance = IERC20(baseToken).balanceOf(self);
        IERC20(baseToken).transfer(pyroToken,balance);
    }
}