
import express from "express";
import { ObjectId } from "mongodb";
import { db } from "../config/db";
import { usersCollection } from "../utils/collections";

const router = express.Router();

// Validate and convert MongoDB ID
const getObjectId = (id: string) => {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  return new ObjectId(id);
};

// Get all users
router.get("/users", async (req, res) => {
  try {
    const users = await usersCollection()
      .find(
        {},
        {
          projection: {
            name: 1,
            email: 1,
            image: 1,
            emailVerified: 1,
            role: 1,
            businessName: 1,
            subscriptionPlan: 1,
            subscriptionExpiresAt: 1,
            createdAt: 1,
            updatedAt: 1,
            status: 1,
          },
        },
      )
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json(users);
  } catch (error) {
    console.error("Failed to fetch users:", error);

    res.status(500).json({
      message: "Failed to fetch users",
    });
  }
});

// Get a single user by ID
router.get("/users/:id", async (req, res) => {
  try {
    const userId = getObjectId(req.params.id);

    if (!userId) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    const user = await usersCollection().findOne(
      { _id: userId },
      {
        projection: {
          name: 1,
          email: 1,
          image: 1,
          emailVerified: 1,
          role: 1,
          businessName: 1,
          subscriptionPlan: 1,
          subscriptionExpiresAt: 1,
          createdAt: 1,
          updatedAt: 1,
          status: 1,
        },
      },
    );

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("Failed to fetch user details:", error);

    res.status(500).json({
      message: "Failed to fetch user details",
    });
  }
});

// Update user status
router.patch("/users/:id/status", async (req, res) => {
  try {
    const userId = getObjectId(req.params.id);
    const { status } = req.body;

    if (!userId) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    const allowedStatuses = ["active", "inactive", "blocked"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "Invalid status",
      });
    }

    const user = await usersCollection().findOne({ _id: userId });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Prevent disabling the last active admin
    if (
      user.role === "admin" &&
      status !== "active" &&
      (user.status === "active" || !user.status)
    ) {
      const otherActiveAdmins = await usersCollection().countDocuments({
        _id: { $ne: userId },
        role: "admin",
        status: { $in: [null, "active"] },
      });

      if (otherActiveAdmins === 0) {
        return res.status(400).json({
          message: "Cannot disable the last active admin",
        });
      }
    }

    await usersCollection().updateOne(
      { _id: userId },
      {
        $set: {
          status,
          updatedAt: new Date(),
        },
      },
    );

    // Revoke user sessions when inactive or blocked
    if (status !== "active") {
      await db.collection("session").deleteMany({
        userId: userId.toHexString(),
      });
    }

    res.status(200).json({
      message: `User status updated to ${status}`,
    });
  } catch (error) {
    console.error("Failed to update user status:", error);

    res.status(500).json({
      message: "Failed to update user status",
    });
  }
});

// Update user role
router.patch("/users/:id/role", async (req, res) => {
  try {
    const userId = getObjectId(req.params.id);
    const { role } = req.body;

    if (!userId) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    const allowedRoles = ["customer", "vendor", "admin"];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        message: "Invalid role",
      });
    }

    const user = await usersCollection().findOne({ _id: userId });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Prevent demoting the last admin
    if (user.role === "admin" && role !== "admin") {
      const otherAdmins = await usersCollection().countDocuments({
        _id: { $ne: userId },
        role: "admin",
      });

      if (otherAdmins === 0) {
        return res.status(400).json({
          message: "Cannot remove the last admin",
        });
      }
    }

    await usersCollection().updateOne(
      { _id: userId },
      {
        $set: {
          role,
          updatedAt: new Date(),
        },
      },
    );

    // Revoke sessions after a role change
    await db.collection("session").deleteMany({
      userId: userId.toHexString(),
    });

    res.status(200).json({
      message: `User role updated to ${role}`,
    });
  } catch (error) {
    console.error("Failed to update user role:", error);

    res.status(500).json({
      message: "Failed to update user role",
    });
  }
});

// Delete a user
router.delete("/users/:id", async (req, res) => {
  try {
    const userId = getObjectId(req.params.id);

    if (!userId) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    const user = await usersCollection().findOne({ _id: userId });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Prevent deleting the last admin
    if (user.role === "admin") {
      const otherAdmins = await usersCollection().countDocuments({
        _id: { $ne: userId },
        role: "admin",
      });

      if (otherAdmins === 0) {
        return res.status(400).json({
          message: "Cannot delete the last admin",
        });
      }
    }

    // Remove associated sessions and account records
    await db.collection("session").deleteMany({
      userId: userId.toHexString(),
    });

    await db.collection("account").deleteMany({
      userId: userId.toHexString(),
    });

    const result = await usersCollection().deleteOne({
      _id: userId,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.status(200).json({
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Failed to delete user:", error);

    res.status(500).json({
      message: "Failed to delete user",
    });
  }
});

export default router;
