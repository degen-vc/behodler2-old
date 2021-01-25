const { accounts, contract } = require('@openzeppelin/test-environment');
const { BN, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const Lachesis = contract.fromArtifact('Lachesis');
const mockToken1 = contract.fromArtifact('MockToken1')
const MockSwapFactory = contract.fromArtifact('MockSwapFactory')

describe('Lachesis', function () {
    const [owner, notOwner] = accounts;

    beforeEach(async function () {
        this.sushiswap = await MockSwapFactory.new({ from: owner })
        this.uniswap = await MockSwapFactory.new({ from: owner })

        this.lachesis = await Lachesis.new(this.uniswap.address, this.sushiswap.address, { from: owner });
        this.mockToken = await mockToken1.new({ from: owner })
    });

    it('fails to measure when non admin attempts', async function () {
        await expectRevert(this.lachesis.measure(this.mockToken.address, false, false, { from: notOwner }), "Ownable: caller is not the owner")
    });

    it('sets token, inverts properties and resets as owner', async function () {
        let result = await this.lachesis.cut(this.mockToken.address)
        expect(result).to.be.an('object').that.deep.equals({ '0': false, '1': false })

        await this.lachesis.measure(this.mockToken.address, true, false, { from: owner })
        result = await this.lachesis.cut(this.mockToken.address)
        expect(result).to.be.an('object').that.deep.equals({ '0': true, '1': false })

        await this.lachesis.measure(this.mockToken.address, false, true, { from: owner })
        result = await this.lachesis.cut(this.mockToken.address)
        expect(result).to.be.an('object').that.deep.equals({ '0': false, '1': true })

        await this.lachesis.measure(this.mockToken.address, true, true, { from: owner })
        result = await this.lachesis.cut(this.mockToken.address)
        expect(result).to.be.an('object').that.deep.equals({ '0': true, '1': true })

        await this.lachesis.measure(this.mockToken.address, false, false, { from: owner })
        result = await this.lachesis.cut(this.mockToken.address)
        expect(result).to.be.an('object').that.deep.equals({ '0': false, '1': false })
    })

    it('adding an LP token for an invalid token fails', async function () {
        this.invalidMockToken = await mockToken1.new({})
        await this.lachesis.measure(this.mockToken.address, true, true, { from: owner })

        await expectRevert(this.lachesis.measureLP(this.mockToken.address, this.invalidMockToken.address), "LACHESIS: Only valid tokens can have their LP added")
    })

    it('adding an an LP that is not registered with either sushi or uni fails', async function () {
        this.validToken2 = await mockToken1.new({})
        await this.lachesis.measure(this.mockToken.address, true, true, { from: owner })
        await this.lachesis.measure(this.validToken2.address, true, true, { from: owner })

        await expectRevert(this.lachesis.measureLP(this.mockToken.address, this.validToken2.address), "LACHESIS: LP token not found.")
    })

    it('adding an LP to uniswap succesfully registers', async function () {
        this.validToken2 = await mockToken1.new({})
        await this.lachesis.measure(this.mockToken.address, true, true, { from: owner })
        await this.lachesis.measure(this.validToken2.address, true, true, { from: owner })

        this.uniswapLP = await mockToken1.new({})
        await this.uniswap.addPair(this.mockToken.address, this.validToken2.address, this.uniswapLP.address)
        await this.lachesis.measureLP(this.mockToken.address, this.validToken2.address)

        const result = await this.lachesis.cut(this.uniswapLP.address)
        expect(result).to.be.an('object').that.deep.equals({ '0': true, '1': false })
    })

    it('adding an LP to sushiswap succesfully registers', async function () {
        this.validToken2 = await mockToken1.new({})
        await this.lachesis.measure(this.mockToken.address, true, true, { from: owner })
        await this.lachesis.measure(this.validToken2.address, true, true, { from: owner })

        this.sushiswapLP = await mockToken1.new({})
        await this.sushiswap.addPair(this.mockToken.address, this.validToken2.address, this.sushiswapLP.address)
        await this.lachesis.measureLP(this.mockToken.address, this.validToken2.address)

        const result = await this.lachesis.cut(this.sushiswapLP.address)
        expect(result).to.be.an('object').that.deep.equals({ '0': true, '1': false })
    })
});