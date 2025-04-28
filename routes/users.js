const express = require('express');
const User = require('../models/User');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const bcryptjs = require('bcryptjs');
const router = express.Router();

// Create new user (admin only)
router.post('/', [auth, admin], async (req, res) => {
  try {
    const { username, password, role } = req.body;

    // Validate required fields
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Check if user already exists
    let user = await User.findOne({ username });
    if (user) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Create new user
    user = new User({
      username,
      password,
      role: role || 'user' // Default role is 'user' if not specified
    });

    // Hash the password
    const salt = await bcryptjs.genSalt(10);
    user.password = await bcryptjs.hash(password, salt);

    // Save the user
    await user.save();

    // Return the user without password
    const savedUser = await User.findById(user._id, '-password');
    res.status(201).json(savedUser);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all users (admin only)
router.get('/', [auth, admin], async (req, res) => {
  try {
    // Get all users except their passwords
    const users = await User.find({}, '-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get own profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id, '-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific user (admin only)
router.get('/:userId', [auth, admin], async (req, res) => {
  try {
    const user = await User.findById(req.params.userId, '-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user (admin only)
router.put('/:userId', [auth, admin], async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const userId = req.params.userId;

    // Find the user to update
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Si l'admin modifie son propre profil, il ne peut pas changer son rôle
    if (userId === req.user._id.toString() && role && role !== user.role) {
      return res.status(403).json({ error: 'Vous ne pouvez pas modifier votre propre rôle' });
    }

    // Update user fields
    if (username) user.username = username;
    if (password) {
      const salt = await bcryptjs.genSalt(10);
      user.password = await bcryptjs.hash(password, salt);
    }
    if (role && userId !== req.user._id.toString()) user.role = role;

    // Save the updated user
    await user.save();

    // Return the updated user without password
    const updatedUser = await User.findById(userId, '-password');
    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update own profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Find the user
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user fields
    if (username) user.username = username;
    if (password) user.password = password;

    // Save the updated user
    await user.save();

    // Return the updated user without password
    const updatedUser = await User.findById(req.user._id, '-password');
    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete user (admin only)
router.delete('/:userId', [auth, admin], async (req, res) => {
  try {
    const userId = req.params.userId;

    // Prevent admin from deleting their own account
    if (userId === req.user._id.toString()) {
      return res.status(403).json({ error: 'You cannot delete your own account' });
    }

    // Find and delete the user
    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router; 