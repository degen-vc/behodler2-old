const { accounts, contract } = require('@openzeppelin/test-environment');
const { expectEvent, expectRevert, ether } = require('@openzeppelin/test-helpers');
const { expect, assert } = require('chai');
const bigNum = require('./helpers/BigIntUtil')

const Behodler = contract.fromArtifact('Behodler');
const AddressBalanceCheck = contract.fromArtifact('AddressBalanceCheck');
const CommonMath = contract.fromArtifact('CommonMath');
const MockToken1 = contract.fromArtifact('MockToken1')
const MockWeth = contract.fromArtifact('MockWeth')
const OpenArbiter = contract.fromArtifact('OpenArbiter')
const Lachesis = contract.fromArtifact('Lachesis')

const ONE = 1000000000000000000n
const FINNEY = 1000000000000000n
const SZABO = 1000000000000n
const GWEI = 1000000000n
const MWEI = 1000000n
const KWEI = 1000n


describe('Behodler', function () {
    const [owner, trader1, trader2, feeDestination] = accounts;

    beforeEach(async function () {

        const addressBalanceCheckLib = await AddressBalanceCheck.new()
        const commonMathLib = await CommonMath.new()
        await Behodler.detectNetwork()
        await Behodler.link('AddressBalanceCheck', addressBalanceCheckLib.address)
        await Behodler.link('CommonMath', commonMathLib.address)
        this.behodler = await Behodler.new({ from: owner });

        this.weth = await MockWeth.new({ from: owner })
        this.regularToken = await MockToken1.new({ from: owner })
        this.burnableToken = await MockToken1.new({ from: owner })
        this.invalidToken = await MockToken1.new({ from: owner })
        this.flashLoanArbiter = await OpenArbiter.new({ from: owner })
        this.lachesis = await Lachesis.new({ from: owner })

        await this.behodler.seed(this.weth.address, this.lachesis.address, this.flashLoanArbiter.address, { from: owner })
        await this.behodler.configureScarcity(110, 25, feeDestination, { from: owner })
        await this.lachesis.measure(this.regularToken.address, true, false, { from: owner })
        await this.lachesis.measure(this.burnableToken.address, true, true, { from: owner })

        await this.lachesis.setBehodler(this.behodler.address, { from: owner })
        await this.lachesis.updateBehodler(this.regularToken.address, { from: owner })
        await this.lachesis.updateBehodler(this.burnableToken.address, { from: owner })

        await this.regularToken.mint(trader1, ONE)
        await this.regularToken.mint(trader2, ONE)
        await this.burnableToken.mint(trader1, ONE)
        await this.burnableToken.mint(trader2, ONE)
        await this.invalidToken.mint(trader1, ONE)
        await this.invalidToken.mint(trader2, ONE)
    });

    it('adding burnable token as liquidity generates the correct volume of Scarcity', async function () {
        //ADD 1 FINNEY WHEN BEHODLER BALANCE OF TOKEN ZERO
        const originalBalance = ONE
        const expectedBalanceAfter = originalBalance - FINNEY

        const scarcitySupplyBefore = await bigNum.BNtoBigInt(this.behodler.totalSupply.call())
        expect(scarcitySupplyBefore).to.equal(0n)

        await this.burnableToken.approve(this.behodler.address, originalBalance, { from: trader1 })
        await this.behodler.addLiquidity(this.burnableToken.address, FINNEY, 0, 31622776, 31224989, { from: trader1 })

        const tokenBalanceOfUser = await bigNum.BNtoBigInt(this.burnableToken.balanceOf.call(trader1))
        expect(tokenBalanceOfUser).to.equal(expectedBalanceAfter)
        const scarcityBalance = await bigNum.BNtoBigInt(this.behodler.balanceOf.call(trader1))

        // (9.75x10¹⁴)x4294967296 = 134110306572959744
        const expectedScarcity = 134110306572959744n
        expect(scarcityBalance).to.equal(expectedScarcity)

        const scarcitySupplyAfter = await bigNum.BNtoBigInt(this.behodler.totalSupply.call())
        expect(scarcitySupplyAfter).to.equal(expectedScarcity)

        //ADD 20 FINNEY WHEN BEHODLER BALANCE IS 1 FINNEY
        //EXPECTED SCARCITY: (ROOT(21 FINNEY)-ROOT(1 FINNEY))*2^32 ≈ 4.865811007×10¹⁷

        await this.behodler.addLiquidity(this.burnableToken.address, 21n * FINNEY, 31224989, 148323969, 146458185, { from: trader1 })
        //21450000000000000
        // console.log(`balanceAfterBurn: ${result[0].toString()}, rootfinal: ${result[1].toString()}`)
        const expectedBalanceAfterSecondAdd = expectedBalanceAfter - 21n * FINNEY
        const tokenBalanceOfUserAfterSecondAdd = await bigNum.BNtoBigInt(this.burnableToken.balanceOf.call(trader1))
        expect(tokenBalanceOfUserAfterSecondAdd).to.equal(expectedBalanceAfterSecondAdd)

        const scarcityBalanceAfterSecondAdd = await bigNum.BNtoBigInt(this.behodler.balanceOf.call(trader1))

        const expectedScarcityAfterSecondAdd = 629033114806517760n
        console.log('expecto: ' + expectedScarcityAfterSecondAdd)
        //1% discrepancy
        assert.isTrue(scarcityBalanceAfterSecondAdd === expectedScarcityAfterSecondAdd,`${expectedScarcityAfterSecondAdd}; ${scarcityBalanceAfterSecondAdd}`)
    })

})