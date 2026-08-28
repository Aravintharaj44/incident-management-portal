const mongoose = require("mongoose");

/**
 * Backs the human-readable incident reference (INC-000001).
 *
 * A single atomic `findOneAndUpdate` with `$inc` guarantees a unique sequence
 * value even when two incidents are created at the same instant - counting
 * documents would race.
 */
const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
});

counterSchema.statics.next = async function next(key) {
    const counter = await this.findByIdAndUpdate(
        key,
        { $inc: { seq: 1 } },
        { returnDocument: "after", upsert: true }
    );

    return counter.seq;
};

module.exports = mongoose.model("Counter", counterSchema);
