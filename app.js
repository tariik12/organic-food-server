// Import necessary modules
const express = require('express');
const session = require('express-session');
const mysql = require('mysql');
const crypto = require('crypto');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const { promises: fs } = require('fs');
const SSLCommerzPayment = require("sslcommerz-lts");

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Generate a secure random string for session secret
const secureRandomString = crypto.randomBytes(32).toString('hex');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('im'));
app.use(session({
  secret: secureRandomString,
  resave: false,
  saveUninitialized: true,
}));

// Create MySQL connection pool
const pool = mysql.createPool({
  user: "root",
  host: "localhost",
  password: "",
  database: "organic-food",
});

// Middleware for handling file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'im/images');
  },
  filename: (req, file, cb) => {
    cb(null, file.fieldname + "_" + Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// Route for uploading a product
app.post('/product-upload', upload.single('productImage'), (req, res) => {
  // Extract product data from request body
  const { productName, parentTitle, type, madeIn, netWeight, price, prePrice, description } = req.body;
  const productImage = req.file.filename;

  // Prepare SQL query
  const sql = "INSERT INTO product (productName, parentTitle, type, madeIn, netWeight, price, prePrice, description, productImage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
  const values = [productName, parentTitle, type, madeIn, netWeight, price, prePrice, description, productImage];

  // Execute query
  pool.query(sql, values, (err, result) => {
    if (err) {
      console.error("Error inserting values:", err);
      res.status(500).send("Error inserting values");
    } else {
      res.send("Values inserted");
    }
  });
});

// Route for fetching all products
app.get('/get-product', (req, res) => {
  const sql = "SELECT * FROM product";
  pool.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching data:", err);
      res.status(500).send("Error fetching data");
    } else {
      res.json(results);
    }
  });
});

// Route for fetching a product by ID
app.get('/get-product-by-id/:id', (req, res) => {
  const productId = req.params.id;
  const sql = "SELECT * FROM product WHERE id = ?";
  pool.query(sql, [productId], (err, result) => {
    if (err) {
      console.error("Error fetching data:", err);
      res.status(500).send("Error fetching data");
    } else {
      if (result.length === 0) {
        res.status(404).send("Product not found");
      } else {
        res.json(result[0]);
      }
    }
  });
});

// Route for deleting a product by ID
app.delete('/deleteProduct/:id', async (req, res) => {
  const productId = req.params.id;
  const getproductSql = "SELECT * FROM product WHERE id = ?";
  const getproductValues = [productId];

  pool.query(getproductSql, getproductValues, async (err, results) => {
    if (err) {
      console.error("Error fetching product data:", err);
      return res.status(500).send("Error fetching product data");
    } else {
      const product = results[0];
      if (!product) {
        return res.status(404).send("Product not found");
      }
      const imagePath = path.join(__dirname, 'im/images', product.productImage);

      try {
        await fs.promises.access(imagePath);
        await fs.promises.unlink(imagePath);
      } catch (unlinkError) {
        console.error("Error deleting image file:", unlinkError);
        return res.status(500).send("Error deleting image file");
      }

      const deleteproductSql = "DELETE FROM product WHERE id = ?";
      const deleteproductValues = [productId];

      pool.query(deleteproductSql, deleteproductValues, (deleteError, deleteResult) => {
        if (deleteError) {
          console.error("Error deleting product:", deleteError);
          return res.status(500).send("Error deleting product");
        } else {
          return res.send("Product and image deleted");
        }
      });
    }
  });
});

// Route for updating a product by ID
app.patch('/updateProduct/:id', upload.single('productImage'), async (req, res) => {
  // Implementation for updating a product
});

// Generate a unique transaction ID
const generateTransactionId = () => {
  return crypto.randomBytes(16).toString('hex');
};

// Route for handling orders
app.post('/order', async (req, res) => {
  const order = req.body;
  const tran_id = generateTransactionId();

  console.log(order);
  console.log(tran_id);

  const data = {
    total_amount: order.price,
    currency: order.currency,
    tran_id: tran_id,
    success_url: `https://bd-crafts-server.vercel.app/payment/success/${tran_id}`,
    fail_url: `https://bd-crafts-server.vercel.app/payment/fail/${tran_id}`,
    cancel_url: 'https://bd-crafts-server.vercel.app/login',
    ipn_url: 'https://bd-crafts-server.vercel.app/ipn',
    shipping_method: 'Courier',
    product_name: 'Computer.',
    product_category: 'Electronic',
    product_profile: 'general',
    cus_name: order.name,
    cus_email: 'customer@example.com',
    cus_add1: order.address,
    cus_add2: 'Dhaka',
    cus_city: 'Dhaka',
    cus_state: 'Dhaka',
    cus_postcode: '1000',
    cus_country: 'Bangladesh',
    cus_phone: '01711111111',
    cus_fax: '01711111111',
    ship_name: 'Customer Name',
    ship_add1: 'Dhaka',
    ship_add2: 'Dhaka',
    ship_city: 'Dhaka',
    ship_state: 'Dhaka',
    ship_postcode: 1000,
    ship_country: 'Bangladesh',
  };

  console.log(data);

  const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
  sslcz.init(data).then(apiResponse => {
    let GatewayPageURL = apiResponse.GatewayPageURL;
    res.send({ url: GatewayPageURL });

    const finalOrder = {
      paidStatus: false,
      transjectionId: tran_id,
    };

    const result = OrderCollection.insertOne(finalOrder);
    console.log('Redirecting to: ', GatewayPageURL);
  });
});

// Route for handling successful payments
app.post("/payment/success/:tranID", async (req, res) => {
  const tranID = req.params.tranID;

  try {
    const result = await pool.query(
      "UPDATE OrderTable SET paidStatus = ? WHERE transjectionId = ?",
      [true, tranID]
    );

    if (result.affectedRows > 0) {
      res.redirect(`https://bd-crafts-client.vercel.app/paymentSuccess/${tranID}`);
    } else {
      res.status(404).send("Transaction ID not found");
    }
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).send("Internal server error");
  }
});

// Route for handling failed payments
app.post("/payment/fail/:tranID", async (req, res) => {
  const tranID = req.params.tranID;

  try {
    const result = await pool.query(
      "DELETE FROM OrderTable WHERE transjectionId = ?",
      [tranID]
    );

    if (result.affectedRows > 0) {
      res.redirect(`https://bd-crafts-client.vercel.app/payment/fail/${tranID}`);
    } else {
      res.status(404).send("Transaction ID not found");
    }
  } catch (error) {
    console.error("Error deleting order record:", error);
    res.status(500).send("Internal server error");
  }
});

// Route for serving product images
app.get('/images/:imageName', (req, res) => {
  const imageName = req.params.imageName;
  res.sendFile(path.join(__dirname, 'public/images', imageName));
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
