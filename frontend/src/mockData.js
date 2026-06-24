export const MOCK_APPS = {
  NexusCRM: {
    prompt: "Build a CRM with login, contacts, dashboard, role-based access, and premium plan with payments. Admins can see analytics.",
    output: {
      status: "success",
      app_name: "NexusCRM",
      intent: {
        app_name: "NexusCRM",
        assumptions: [
          "Stripe payment gateway is integrated for subscription billing",
          "Administrators have full access to contacts, billing, and analytics",
          "Free tier is capped at 5 contacts; premium tier unlocks unlimited contacts"
        ],
        ambiguity_flags: [
          { type: "billing_integration", description: "Unspecified payment provider — defaulted to Stripe gateway", resolution: "Configured sandbox billing schemas" }
        ]
      },
      metrics: {
        total_duration_ms: 1420,
        tokens: { input: 820, output: 1240 },
        cost_estimate_usd: 0.0034,
        runtime: { overall_executable: true }
      },
      runtime_proof: {
        status: "active",
        startup_time_ms: 145,
        logs: [
          "[sandbox-db] initialized tables: users, contacts, subscriptions",
          "[sandbox-api] registered paths: /api/v1/auth/login, /api/v1/contacts, /api/v1/billing",
          "[sandbox-runtime] NexusCRM app container booted on port 3000"
        ]
      },
      schemas: {
        db: {
          tables: [
            { name: "users", columns: [{ name: "id" }, { name: "email" }, { name: "role" }] },
            { name: "contacts", columns: [{ name: "id" }, { name: "name" }, { name: "email" }, { name: "company" }, { name: "status" }] },
            { name: "subscriptions", columns: [{ name: "id" }, { name: "user_id" }, { name: "status" }] }
          ]
        },
        api: {
          endpoints: [
            { path: "/api/v1/auth/login", method: "POST" },
            { path: "/api/v1/contacts", method: "GET" },
            { path: "/api/v1/contacts", method: "POST" },
            { path: "/api/v1/billing/checkout", method: "POST" },
            { path: "/api/v1/analytics", method: "GET" }
          ]
        },
        ui: {
          name: "NexusCRM",
          pages: [
            {
              id: "Dashboard",
              name: "Dashboard",
              route: "/dashboard",
              components: [
                { type: "StatCard", label: "Total Leads", value: "148" },
                { type: "StatCard", label: "Active Subscriptions", value: "42" },
                { type: "StatCard", label: "Monthly Revenue", value: "$8,240" },
                {
                  type: "Chart",
                  title: "Revenue Breakdown",
                  data_source: "/api/v1/analytics",
                  stats: [
                    { label: "Stripe Payments", value: 75 },
                    { label: "Invoices", value: 25 }
                  ]
                }
              ]
            },
            {
              id: "Contacts",
              name: "Contacts",
              route: "/contacts",
              components: [
                {
                  type: "DataTable",
                  data_source: "/api/v1/contacts",
                  columns: [
                    { field: "name", "label": "Name" },
                    { field: "email", "label": "Email" },
                    { field: "company", "label": "Company" },
                    { field: "status", "label": "Status" }
                  ]
                }
              ]
            },
            {
              id: "Analytics",
              name: "Analytics",
              route: "/analytics",
              access_roles: ["admin"],
              components: [
                {
                  type: "Chart",
                  title: "Contacts by Status",
                  data_source: "/api/v1/analytics",
                  stats: [
                    { label: "Lead", value: 60 },
                    { label: "Customer", value: 40 }
                  ]
                }
              ]
            },
            {
              id: "Billing",
              name: "Go Premium",
              route: "/billing",
              components: [
                { type: "Button", label: "Upgrade to Premium Plan ($19/mo)" }
              ]
            }
          ]
        },
        auth: {
          roles: ["admin", "user"]
        }
      }
    }
  },
  KitchenDisplay: {
    prompt: "Build a kitchen display system for a restaurant. Cooks can view order tickets, check ticket items, and mark orders completed.",
    output: {
      status: "success",
      app_name: "KitchenDisplay",
      intent: {
        app_name: "KitchenDisplay",
        assumptions: [
          "Order items update in real-time via polling",
          "Cooks can update order status from preparing to completed",
          "Orders older than 15 minutes display urgent alerts"
        ],
        ambiguity_flags: [
          { type: "refresh_frequency", description: "Refresh interval not specified — defaulted to 5s", resolution: "Configured local cache invalidation" }
        ]
      },
      metrics: {
        total_duration_ms: 1120,
        tokens: { input: 640, output: 920 },
        cost_estimate_usd: 0.0022,
        runtime: { overall_executable: true }
      },
      runtime_proof: {
        status: "active",
        startup_time_ms: 110,
        logs: [
          "[sandbox-db] initialized tables: orders, order_items, users",
          "[sandbox-api] registered paths: /api/v1/orders, /api/v1/orders/complete",
          "[sandbox-runtime] KitchenDisplay KDS container online"
        ]
      },
      schemas: {
        db: {
          tables: [
            { name: "orders", columns: [{ name: "id" }, { name: "table_number" }, { name: "status" }] },
            { name: "order_items", columns: [{ name: "id" }, { name: "order_id" }, { name: "item_name" }, { name: "quantity" }] }
          ]
        },
        api: {
          endpoints: [
            { path: "/api/v1/orders", method: "GET" },
            { path: "/api/v1/orders/complete", method: "POST" }
          ]
        },
        ui: {
          name: "KitchenDisplay",
          pages: [
            {
              id: "Orders",
              name: "KDS Board",
              route: "/orders",
              components: [
                {
                  type: "KitchenDisplay",
                  data_source: "/api/v1/orders",
                  columns: []
                }
              ]
            },
            {
              id: "Settings",
              name: "Menu Settings",
              route: "/settings",
              components: [
                { type: "Button", label: "Sync POS Terminal Items" }
              ]
            }
          ]
        },
        auth: {
          roles: ["cook", "manager"]
        }
      }
    }
  },
  EShop: {
    prompt: "Create an e-commerce platform with product catalog, cart, checkout, order tracking, and vendor management.",
    output: {
      status: "success",
      app_name: "E-Shop API",
      intent: {
        app_name: "E-Shop API",
        assumptions: [
          "Products have a catalog listing (title, price, stock quantity)",
          "Order checkout details write sandbox records instantly"
        ],
        ambiguity_flags: []
      },
      metrics: {
        total_duration_ms: 950,
        tokens: { input: 520, output: 840 },
        cost_estimate_usd: 0.0019,
        runtime: { overall_executable: true }
      },
      runtime_proof: {
        status: "active",
        startup_time_ms: 95,
        logs: [
          "[sandbox-db] initialized tables: products, orders, cart_items",
          "[sandbox-api] registered paths: /api/v1/products, /api/v1/orders",
          "[sandbox-runtime] EShop sandbox listening on port 3000"
        ]
      },
      schemas: {
        db: {
          tables: [
            { name: "products", columns: [{ name: "id" }, { name: "title" }, { name: "price" }, { name: "stock" }] },
            { name: "orders", columns: [{ name: "id" }, { name: "total_price" }, { name: "shipping_address" }] }
          ]
        },
        api: {
          endpoints: [
            { path: "/api/v1/products", method: "GET" },
            { path: "/api/v1/products", method: "POST" },
            { path: "/api/v1/orders", method: "POST" }
          ]
        },
        ui: {
          name: "E-Shop API",
          pages: [
            {
              id: "Catalog",
              name: "Product Catalog",
              route: "/catalog",
              components: [
                {
                  type: "DataTable",
                  data_source: "/api/v1/products",
                  columns: [
                    { field: "title", "label": "Title" },
                    { field: "price", "label": "Price" },
                    { field: "stock", "label": "Stock Qty" }
                  ]
                }
              ]
            },
            {
              id: "Checkout",
              name: "Shopping Cart",
              route: "/cart",
              components: [
                { type: "Button", label: "Proceed to Sandbox Checkout" }
              ]
            }
          ]
        },
        auth: {
          roles: ["customer", "admin"]
        }
      }
    }
  }
};
