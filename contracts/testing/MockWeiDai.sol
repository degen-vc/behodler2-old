// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
import "../openzeppelin/IERC20.sol";
import "../openzeppelin/SafeMath.sol";

contract MockWeiDai is IERC20 {
    using SafeMath for uint256;
    uint256 _totalSupply;
    mapping(address => uint256) balances;
    mapping(address => mapping(address => uint256)) allowances;

    string public override name = "Mock";
    string public override symbol = "MCK";

    function decimals() public override returns (uint8) {
        return 18;
    }

    function setSupply(uint256 supply) public {
        _totalSupply = supply;
    }

    function totalSupply() external view override returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account)
        external
        view
        override
        returns (uint256)
    {
        return balances[account];
    }

    function transfer(address recipient, uint256 amount)
        external
        override
        returns (bool)
    {
        _transfer(msg.sender, recipient, amount);
    }

    function allowance(address owner, address spender)
        external
        view
        override
        returns (uint256)
    {
        return allowances[owner][spender];
    }

    function approve(address spender, uint256 amount)
        external
        override
        returns (bool)
    {
        allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external override returns (bool) {
        require(
            allowances[sender][recipient] >= amount,
            "ERC20: not approved to send"
        );
        _transfer(sender, recipient, amount);
        return true;
    }

    function mint(address recipient, uint256 amount) public {
        balances[recipient] = balances[recipient].add(amount);
        _totalSupply = _totalSupply.add(amount);
    }

    function burn(address holder, uint256 amount) public {
        balances[holder] = balances[holder].sub(amount);
        _totalSupply = _totalSupply.sub(amount);
    }

    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal returns (bool) {
        balances[recipient] = balances[recipient].add(amount);
        balances[sender] = balances[sender].sub(amount);
        emit Transfer(sender, recipient, amount);
    }
}
