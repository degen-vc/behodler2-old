// SPDX-License-Identifier: MIT
pragma solidity ^0.7.1;

import "./openzeppelin/IERC20.sol";
import "./openzeppelin/Ownable.sol";
import "./openzeppelin/SafeMath.sol";
import "./facades/Burnable.sol";

/*
    Scarcity is the bonding curve token that underpins Behodler functionality
    Scarcity burns on transfer and also exacts a fee outside of Behodler.
 */
contract Scarcity is IERC20, Ownable {
    using SafeMath for uint256;
    event Mint(address sender, address recipient, uint value);
    event Burn (uint value);

    mapping(address => uint256) internal _balances;
    mapping(address => mapping(address => uint256)) internal _allowances;
    uint256 internal _totalSupply;
    address public migrator;

    struct BurnConfig {
        uint256 transferFee; // percentage expressed as number betewen 1 and 1000
        uint256 burnFee; // percentage expressed as number betewen 1 and 1000
        address feeDestination;
    }

    BurnConfig public config;

    function configureScarcity(
        uint transferFee,
        uint burnFee,
        address feeDestination
    ) public onlyOwner {
        require(config.transferFee + config.burnFee < 1000);
        config.transferFee = transferFee;
        config.burnFee = burnFee;
        config.feeDestination = feeDestination;
    }

    function setMigrator (address m) public onlyOwner {
        migrator = m;
    }

    function name() public pure returns (string memory) {
        return "Scarcity";
    }

    function symbol() public pure returns (string memory) {
        return "SCX";
    }

    function decimals() public pure returns (uint8) {
        return 18;
    }

    function totalSupply() external override view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account)
        external
        override
        view
        returns (uint256)
    {
        return _balances[account];
    }

    function transfer(address recipient, uint256 amount)
        external
        override
        returns (bool)
    {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function allowance(address owner, address spender)
        external
        override
        view
        returns (uint256)
    {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount)
        external
        override
        returns (bool)
    {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external override returns (bool) {
        _transfer(sender, recipient, amount);
        _approve(
            sender,
            msg.sender,
            _allowances[sender][msg.sender].sub(
                amount,
                "ERC20: transfer amount exceeds allowance"
            )
        );
        return true;
    }

    function burn(uint256 value) external returns (bool) {
        _balances[msg.sender] = _balances[msg.sender].sub(
            value,
            "SCARCITY: insufficient funds"
        );
        _totalSupply = _totalSupply.sub(value);
        emit Burn(value);
    }

    function mint(address recipient, uint256 value) internal {
        _balances[recipient] = _balances[recipient].add(value);
        _totalSupply = _totalSupply.add(value);
        emit Mint(msg.sender, recipient, value);
    }

    function migrateMint(address recipient, uint value) public {
        require(msg.sender == migrator,"SCARCITY: Migration contract only");
        mint(recipient, value);
    }

    function _approve(
        address owner,
        address spender,
        uint256 amount
    ) internal virtual {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    //outside of Behodler, Scarcity transfer incurs a fee.
    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal virtual {
        require(
            sender != address(0),
            "Scarcity: transfer from the zero address"
        );
        require(
            recipient != address(0),
            "Scarcity: transfer to the zero address"
        );

        uint256 feeComponent = config.transferFee.mul(amount).div(1000);
        uint burnComponent = config.burnFee.mul(amount).div(1000);
        _totalSupply = _totalSupply.sub(burnComponent);
        emit Burn(burnComponent);

        _balances[config.feeDestination] = _balances[config.feeDestination].add(
            feeComponent
        );

        _balances[sender] = _balances[sender].sub(
            amount,
            "Scarcity: transfer amount exceeds balance"
        );

        _balances[recipient] = _balances[recipient].add(
            amount.sub(feeComponent.add(burnComponent))
        );
        emit Transfer(sender, recipient, amount);
    }

    function burnFee(address token, uint amount) internal returns (uint) {
        uint256 burnAmount = config.burnFee.mul(amount).div(1000);
        Burnable(token).burn(burnAmount);
        return burnAmount;
    }
}
