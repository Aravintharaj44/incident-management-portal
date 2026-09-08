const { idOf } = require("./ticketMapper");

const userToContact = (user) => {
    if (!user) return null;

    return {
        id: idOf(user),
        name: user.name,
        email: user.email,
        isActive: user.isActive,
        createdAt: user.createdAt || null,
        updatedAt: user.updatedAt || null,
    };
};

/**
 * Map a contact request body onto the User fields the Contacts API is allowed
 * to write. Password, role, isActive (unless explicitly allowed by the caller)
 * and login metadata are never derived from the body here.
 */
const contactToUserPayload = ({ name, email, isActive }) => {
    const payload = {};
    if (name !== undefined) payload.name = name;
    if (email !== undefined) payload.email = email;
    if (isActive !== undefined) payload.isActive = isActive;
    return payload;
};

module.exports = { userToContact, contactToUserPayload };