BNtoBigInt = async (bn) =>{
    const string = (await bn).toString()
    return BigInt(string)
}

module.exports = {
    BNtoBigInt
}