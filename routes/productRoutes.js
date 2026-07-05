import express from "express";
const router = express.Router();
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  updateStock,
} from "../controllers/productController.js";
import { protect, admin } from "../middlewares/authMiddleware.js";
import { upload } from "../config/cloudinary.js";

router.get("/public", getProducts);

router
  .route("/")
  .get(protect, getProducts)
  .post(protect, admin, upload, createProduct);

router
  .route("/:id")
  .put(protect, admin, upload, updateProduct)
  .delete(protect, admin, deleteProduct);

router.put("/:id/stock", protect, updateStock);

export default router;
