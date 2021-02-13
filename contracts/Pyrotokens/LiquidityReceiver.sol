// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
import "../openzeppelin/IERC20.sol";
import "./Pyrotoken.sol";

contract LiquidityReceiver {
    mapping(address => address) public baseTokenMapping;

    function registerPyroToken(address baseToken) public {
        require(
            baseTokenMapping[baseToken] == address(0),
            "BEHODLER: pyrotoken already registered"
        );
        Pyrotoken pyro = new Pyrotoken(baseToken, address(this));
        baseTokenMapping[baseToken] = address(pyro);
    }

    function drain(address pyroToken) public {
        address baseToken = Pyrotoken(pyroToken).baseToken();
        require(
            baseTokenMapping[baseToken] == pyroToken,
            "BEHODLER: pyrotoken not registered."
        );
        address self = address(this);
        uint256 balance = IERC20(baseToken).balanceOf(self);
        IERC20(baseToken).transfer(pyroToken, balance);
    }
}
