const jwt = require("jsonwebtoken");

function getJwtSecret() {
    return process.env.JWT_SECRET || process.env.SECRET;
}

function signToken(user) {
    const secret = getJwtSecret();
    if (!secret) {
        throw new Error("JWT secret missing. Set JWT_SECRET (or SECRET).");
    }

    return jwt.sign(
        {
            id: user._id.toString(),
            role: user.role,
        },
        secret,
        {
            expiresIn: "7d",
        }
    );
}

function verifyTokenString(token) {
    const secret = getJwtSecret();
    if (!secret) {
        throw new Error("JWT secret missing. Set JWT_SECRET (or SECRET).");
    }
    return jwt.verify(token, secret);
}

module.exports = {
    signToken,
    verifyTokenString,
    getJwtSecret,
};
