const Joi = require('joi');
module.exports.listingSchema = Joi.object({
    listing : Joi.object({
        title: Joi.string().required(),
        description: Joi.string().required(),
        location: Joi.string().required(),
        country: Joi.string().required(),
        price: Joi.number().required().min(0),
        image: Joi.string().allow("", null)
    }).required()
});

module.exports.reviewSchema = Joi.object({
    review: Joi.object({
        rating: Joi.number().required().min(1).max(5),
        comment: Joi.string().required(),
    }).required()
});

module.exports.bookingSchema = Joi.object({
    booking: Joi.object({
        listingId: Joi.string().required(),
        guestName: Joi.string().trim().min(2).max(80).required(),
        age: Joi.number().integer().min(1).max(120).required(),
        mobile: Joi.string().trim().min(8).max(20).required(),
        email: Joi.string().trim().email().required(),
        checkInDate: Joi.date().required(),
        checkOutDate: Joi.date().required(),
    }).required(),
});