class ExpressError extends Error {
    constructor(statusCode, message) {
        // Support both signatures:
        // - new ExpressError(statusCode, message)  (preferred)
        // - new ExpressError(message, statusCode)  (legacy)
        if (typeof statusCode === "string" && typeof message === "number") {
            const swappedStatus = message;
            const swappedMessage = statusCode;
            super(swappedMessage);
            this.statusCode = swappedStatus;
            return;
        }

        super(message);
        this.statusCode = statusCode;
    }
}
module.exports = ExpressError;