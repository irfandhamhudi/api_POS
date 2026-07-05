import dotenv from 'dotenv';
dotenv.config();
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import User from "../models/User.js";
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import Transaction from "../models/Transaction.js";
import Notification from "../models/Notification.js";

// Import dummy data
const categories = [
  { slug: "coffee", name: "Coffee", available: true },
  { slug: "tea", name: "Tea", available: true },
  { slug: "snack", name: "Snack", available: true },
  { slug: "main_course", name: "Main Course", available: true },
];

const products = [
  {
    name: "Espresso",
    price: 42000,
    image:
      "https://images.unsplash.com/photo-1510707577719-09411968651c?w=400&q=80",
    category: "coffee",
    available: true,
    stockCount: 50,
  },
  {
    name: "Cappuccino",
    price: 33000,
    image:
      "https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=400&q=80",
    category: "coffee",
    available: true,
    stockCount: 50,
  },
  {
    name: "Latte",
    price: 40000,
    image:
      "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=400&q=80",
    category: "coffee",
    available: true,
    stockCount: 50,
  },
  {
    name: "Peach Oolong Tea",
    price: 38000,
    image:
      "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=400&q=80",
    category: "tea",
    available: true,
    stockCount: 20,
  },
  {
    name: "Matcha Latte",
    price: 45000,
    image:
      "https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=400&q=80",
    category: "tea",
    available: true,
    stockCount: 20,
  },
  {
    name: "Butter Croissant",
    price: 35000,
    image:
      "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&q=80",
    category: "snack",
    available: true,
    stockCount: 10,
  },
  {
    name: "Nasi Goreng Spesial",
    price: 85000,
    image:
      "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&q=80",
    category: "main_course",
    available: true,
    stockCount: 15,
  },
];

const users = [
  {
    username: "admin",
    password: "admin123",
    name: "Administrator",
    role: "admin",
    avatar:
      "https://api.dicebear.com/9.x/avataaars/svg?seed=admin&backgroundColor=b6e3f4",
  },
  {
    username: "kasir",
    password: "kasir123",
    name: "Budi Santoso",
    role: "cashier",
    avatar:
      "https://api.dicebear.com/9.x/avataaars/svg?seed=kasir&backgroundColor=d1d4f9",
  },
];

const importData = async () => {
  try {
    await connectDB();

    await User.deleteMany();
    await Product.deleteMany();
    await Category.deleteMany();
    await Transaction.deleteMany();
    await Notification.deleteMany();

    for (const u of users) {
      await User.create(u);
    }
    await Category.insertMany(categories);
    const createdProducts = await Promise.all(
      products.map((p) => Product.create(p)),
    );

    const adminUser = await User.findOne({ username: "admin" });

    // Dummy transaction
    await Transaction.create({
      receiptNumber: "83920",
      items: [
        {
          product: createdProducts[0]._id,
          quantity: 1,
          size: "medium",
          notes: "Less sugar",
        },
        {
          product: createdProducts[5]._id,
          quantity: 2,
          size: "medium",
          notes: "",
        },
      ],
      subtotal: 112000,
      tax: 11200,
      total: 123200,
      orderType: "dine_in",
      customerName: "John Smith",
      tableNumber: "B12",
      paymentMethod: "cash",
      amountPaid: 150000,
      change: 26800,
      status: "completed",
      cashier: adminUser._id,
    });

    // Dummy Notification
    await Notification.create({
      title: "John Smith",
      message: "Ordered 3 items",
      type: "order",
      read: false,
      receiptNumber: "83920",
      orderType: "dine_in",
      items: [
        {
          name: createdProducts[0].name,
          quantity: 1,
          price: createdProducts[0].price,
          image: createdProducts[0].image,
        },
        {
          name: createdProducts[5].name,
          quantity: 2,
          price: createdProducts[5].price,
          image: createdProducts[5].image,
        },
      ],
    });

    console.log("Data Imported successfully!");
    process.exit();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const destroyData = async () => {
  try {
    await connectDB();
    await User.deleteMany();
    await Product.deleteMany();
    await Category.deleteMany();
    await Transaction.deleteMany();
    await Notification.deleteMany();

    console.log("Data Destroyed successfully!");
    process.exit();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

if (process.argv[2] === "-d") {
  destroyData();
} else {
  importData();
}
