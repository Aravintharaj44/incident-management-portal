const ApiError = require('../utils/ApiError');

const roleCheck = (...allowedRoles) => {
  const roles = allowedRoles.flat().map((r) => String(r).toLowerCase());

  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return next(new ApiError(401, 'Authentication required.'));
    }

    const userRole = String(req.user.role).toLowerCase();

    if (!roles.includes(userRole)) {
      return next(
        new ApiError(
          403,
          'Forbidden: You do not have permission to access this resource.'
        )
      );
    }

    next();
  };
};

module.exports = roleCheck;