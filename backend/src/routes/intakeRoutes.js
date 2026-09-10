const express = require('express');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const {
  listIntakeFailures,
  getIntakeFailure,
  resolveIntakeFailure,
  dismissIntakeFailure,
} = require('../controllers/intakeController');

const router = express.Router();

// Helper to support both array and spread roles safely
const authorizeRoles = (...roles) => {
  const flattenedRoles = roles.flat();
  return roleCheck(flattenedRoles);
};

router.use(auth, authorizeRoles('Admin', 'Manager', 'admin', 'manager'));

router.get('/failures', listIntakeFailures);
router.get('/failures/:id', getIntakeFailure);
router.patch('/failures/:id/resolve', resolveIntakeFailure);
router.patch('/failures/:id/dismiss', dismissIntakeFailure);

module.exports = router;