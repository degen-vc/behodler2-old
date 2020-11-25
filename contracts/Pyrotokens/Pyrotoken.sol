// SPDX-License-Identifier: MIT
pragma solidity ^0.7.1;

import "../openzeppelin/IERC20.sol";
import "../openzeppelin/SafeMath.sol";
import "./LiquidityReceiver.sol";

abstract contract ERC20MetaData{
    function symbol() public virtual returns (string memory);
    function name() public virtual returns (string memory);
}

contract Pyrotoken is IERC20 {
    using SafeMath for uint256;
    uint256 _totalSupply;
    mapping(address => uint256) balances;
    mapping(address => mapping(address => uint256)) allowances;
    address public baseToken;
    uint constant ONE = 1e18;
    LiquidityReceiver liquidityReceiver;

    constructor (address _baseToken, address _liquidityReceiver) {
        baseToken = _baseToken;
        name =string(abi.encodePacked("Pyro ", ERC20MetaData(baseToken).name()));
        symbol =string(abi.encodePacked("Pyro", ERC20MetaData(baseToken).symbol()));
        decimals = 18;
        liquidityReceiver = LiquidityReceiver(_liquidityReceiver);
    }

    string public name;
    string public symbol;
    uint public decimals;

    modifier updateReserve {
        liquidityReceiver.drain(address(this));
        _;
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
        override
        view
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
    }

    function mint(uint baseTokenAmount) external updateReserve {
        uint pyroTokensToMint = baseTokenAmount.mul(ONE).div(redeemRate()); 
        require(IERC20(baseToken).transferFrom(msg.sender,address(this),baseTokenAmount), "PYROTOKEN: basetoken transfer failed.");
        mint(msg.sender,pyroTokensToMint);
    }

    function redeem(uint pyroTokenAmount) external updateReserve {//no approval necessary
        balances[msg.sender] = balances[msg.sender].sub(pyroTokenAmount, "PYROTOKEN: insufficient balance");
        _totalSupply = _totalSupply.sub(pyroTokenAmount);
        uint exitFee = pyroTokenAmount.mul(2).div(100); //2% burn on exit pushes up price for remaining hodlers
        uint net = pyroTokenAmount.sub(exitFee);
        uint baseTokensToRelease = redeemRate().mul(net).div(ONE);
        IERC20(baseToken).transfer(msg.sender, baseTokensToRelease);
    }

    function redeemRate() public view returns (uint) {
        uint balanceOfBase = IERC20(baseToken).balanceOf(address(this));
        if(_totalSupply==0 || balanceOfBase==0)
            return ONE;

        return balanceOfBase.mul(ONE).div(_totalSupply);
    }

    function mint(address recipient, uint256 amount) internal {
        balances[recipient] = balances[recipient].add(amount);
        _totalSupply = _totalSupply.add(amount);
    }

    function burn(uint256 amount) public {
        balances[msg.sender] = balances[msg.sender].sub(amount);
        _totalSupply = _totalSupply.sub(amount);
    }

    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal returns (bool) {
        uint burnFee = amount.div(1000);
        balances[recipient] = balances[recipient].add(amount-burnFee);
        balances[sender] = balances[sender].sub(amount);
        _totalSupply = _totalSupply.sub(burnFee);
        emit Transfer(sender, recipient, amount);
    }

}