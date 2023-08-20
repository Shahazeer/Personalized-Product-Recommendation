var express = require("express");
var app = express();
var dbConnection = require("./database");
var recommended_elements;
var receivedData;

const path = require("path");

// app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname + "/public"));
// app.set("view engine", "ejs");

app.get("/", (req, res) => {
  //Rendering of HTML page to the browser
  res.sendFile(__dirname + "/shop.html");
});

app.use((req, res, next) => {
  //To set the current user of the web page
  if (receivedData) {
    req.currentUser = receivedData;
  }
  next();
});

// app.get("/data", (req, res) => {
//   const recomnd = recommended_elements;
//   res.send(recomnd);
// });

app.post("/add-product-to-database", (req, res) => {
  //Inserting of selected products to the recommendation table
  const product_id = req.body.product_id;

  const userSpecificRecommendTable = `RECOMMEND_${req.currentUser}`;

  const getProductTagQuery = `
    SELECT TAG_ID
    FROM PRODUCT_TAG
    WHERE PRODUCT_ID = ?;
  `;

  dbConnection.query(getProductTagQuery, [product_id], function (err, result) {
    if (err) {
      console.error("Error executing SQL query: ", err);
      res.status(500).send("Error executing SQL query");
      return;
    }

    if (result.length > 0) {
      const tag_id = result[0].TAG_ID;
      console.log("Item with TAG_ID:", tag_id, "selected");

      const productsWithSameTagQuery = `
        SELECT PRODUCT_ID
        FROM PRODUCT_TAG
        WHERE TAG_ID = ?;
      `;

      dbConnection.query(
        productsWithSameTagQuery,
        [tag_id],
        function (err, productResult) {
          if (err) {
            console.error("Error executing SQL query: ", err);
            res.status(500).send("Error executing SQL query");
            return;
          }

          const valueSets = productResult.map((row) => [
            row.PRODUCT_ID,
            tag_id,
            1,
          ]);

          const insertOrUpdateQuery = `
          INSERT INTO ${userSpecificRecommendTable} (PRODUCT_ID, TAG_ID, INCR_TAG)
          VALUES ? 
          ON DUPLICATE KEY UPDATE INCR_TAG = INCR_TAG + 1;
        `;

          dbConnection.query(
            insertOrUpdateQuery,
            [valueSets],
            function (err, result) {
              if (err) {
                console.error("Error executing SQL query: ", err);
                res.status(500).send("Error executing SQL query");
                return;
              }

              res.send("Data inserted or updated successfully");
            }
          );
        }
      );
    } else {
      res.status(400).send("Tag ID not found for the selected product");
    }
  });
});

app.post("/Reset-Recommendation", (req, res) => {
  //To reset the recommendation table of a particular user
  let user_to_reset = `RECOMMEND_${req.currentUser}`;
  let dropTable = `DROP TABLE ${user_to_reset};`;

  dbConnection.query(dropTable, function (err, result) {
    if (err) {
      console.error("Table doesn't exist", err);
      res.status(500).send("Error executing SQL query");
      return;
    } else {
      let createTable = `CREATE TABLE ${user_to_reset}(
        PRODUCT_ID INT,
        TAG_ID INT,
        INCR_TAG INT,
        PRIMARY KEY (PRODUCT_ID, TAG_ID),
        FOREIGN KEY (PRODUCT_ID) REFERENCES PRODUCT_TAG(PRODUCT_ID),
        FOREIGN KEY (TAG_ID) REFERENCES TAG(TAG_ID)
    );`;

      dbConnection.query(createTable, function (err, result1) {
        if (err) {
          console.error("Table doesn't exist", err);
          res.status(500).send("Error executing SQL query");
          return;
        } else {
          res.send(`USER ${req.currentUser}'s recommendation has been reset`);
        }
      });
    }
  });
});

app.get("/set-user-specific-recommendation", (req, res) => {
  //When server is started or when a user is changes this query runs for a particular user.This query takes sorts it descending of order
  receivedData = req.query.value;
  console.log("Received data:", receivedData);

  if (receivedData) {
    const user = receivedData;
    const sql = `
      SELECT PRODUCT_ID
      FROM RECOMMEND_${user}
      ORDER BY INCR_TAG DESC
      LIMIT 4;
    `;
    dbConnection.query(sql, function (err, result) {
      if (err) {
        console.error("Error executing SQL query: ", err);
        res.status(500).send("Error executing SQL query");
        return;
      } else {
        recommended_elements = result;
        // res.send("Data received and SQL query executed successfully");
        res.send(result);
      }
    });
  } else {
    res.status(400).send("Received data is missing");
  }
});

app.get("/set-user-similar-interests", (req, res) => {
  const currentUser = req.currentUser;

  let otherUsers = [];
  if (currentUser === "A") {
    otherUsers = ["B", "C"];
  } else if (currentUser === "B") {
    otherUsers = ["A", "C"];
  } else if (currentUser === "C") {
    otherUsers = ["A", "B"];
  } else {
    res.status(400).send("Invalid user");
    return;
  }

  const sqlCommonRecommendations = `
    SELECT rt.PRODUCT_ID
    FROM RECOMMEND_${otherUsers[0]} rt
    WHERE rt.PRODUCT_ID IN (
      SELECT PRODUCT_ID
      FROM RECOMMEND_${currentUser}
    )
    UNION
    SELECT rt.PRODUCT_ID
    FROM RECOMMEND_${otherUsers[1]} rt
    WHERE rt.PRODUCT_ID IN (
      SELECT PRODUCT_ID
      FROM RECOMMEND_${currentUser}
    );
  `;

  dbConnection.query(
    sqlCommonRecommendations,
    function (err, commonRecommendationsResult) {
      if (err) {
        console.error("Error executing SQL query: ", err);
        res.status(500).send("Error executing SQL query");
        return;
      }

      const commonRecommendations = commonRecommendationsResult.map(
        (row) => row.PRODUCT_ID
      );

      const sqlUncommonRecommendations = `
        SELECT rt.PRODUCT_ID
        FROM RECOMMEND_${otherUsers[0]} rt
        WHERE rt.PRODUCT_ID NOT IN (
          SELECT PRODUCT_ID
          FROM RECOMMEND_${currentUser}
        )
        AND rt.PRODUCT_ID NOT IN (
          SELECT PRODUCT_ID
          FROM RECOMMEND_${currentUser}
          WHERE PRODUCT_ID IN (${commonRecommendations.join(", ")})
        )
        UNION
        SELECT rt.PRODUCT_ID
        FROM RECOMMEND_${otherUsers[1]} rt
        WHERE rt.PRODUCT_ID NOT IN (
          SELECT PRODUCT_ID
          FROM RECOMMEND_${currentUser}
        )
        AND rt.PRODUCT_ID NOT IN (
          SELECT PRODUCT_ID
          FROM RECOMMEND_${currentUser}
          WHERE PRODUCT_ID IN (${commonRecommendations.join(", ")})
        )
        ORDER BY RAND()
        LIMIT 2;
      `;

      dbConnection.query(
        sqlUncommonRecommendations,
        function (err, uncommonRecommendationsResult) {
          if (err) {
            console.error("Error executing SQL query: ", err);
            res.status(500).send("Error executing SQL query");
            return;
          }

          const uncommonRecommendations = uncommonRecommendationsResult.map(
            (row) => row.PRODUCT_ID
          );

          res.json({
            recommendations: uncommonRecommendations,
          });
        }
      );
    }
  );
});

dbConnection.connect(function (err) {
  //Checks for connection with the SQL database
  if (err) console.log(err);
  console.log("Connected to Personalized Product Recommendation");
});

app.post("/recommend", (req, res) => {});

app.listen(3000, () => {
  console.log("Server is running");
});
