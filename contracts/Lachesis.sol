// SPDX-License-Identifier: MIT
pragma solidity ^0.7.1;
import "./openzeppelin/Ownable.sol";
import "./facades/LachesisLike.sol";
import "./facades/BehodlerLike.sol";

contract Lachesis is Ownable, LachesisLike {
    struct tokenConfig {
        bool valid;
        bool burnable;
    }
    address public behodler;
    mapping(address => tokenConfig) private config;

    function cut(address token) public override view returns (bool, bool) {
        tokenConfig memory parameters = config[token];
        return (parameters.valid, parameters.burnable);
    }

    function measure(
        address token,
        bool valid,
        bool burnable
    ) public override onlyOwner {
        config[token] = tokenConfig({valid: valid, burnable: burnable});
    }

    function setBehodler(address b) public onlyOwner {
        behodler = b;
    }

    function updateBehodler(address token) public onlyOwner {
        (bool valid, bool burnable) = cut(token);
        BehodlerLike(behodler).setValidToken(token,valid,burnable);
    }
}
