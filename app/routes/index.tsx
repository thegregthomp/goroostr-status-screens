import React, { useState, useCallback, useEffect } from "react";
import type { LoaderArgs } from "@remix-run/node";
import StatusSection from "~/components/StatusSection";
import { useLoaderData, Link } from "@remix-run/react";
import { json } from "@remix-run/node";
import stylesheetUrl from "../styles/global.css";
import { getOrders } from "~/models/orders.server";
import Pusher from "pusher-js";
import sortBy from "lodash/sortBy";
import indexOf from "lodash/indexOf";
import { useInterval } from "usehooks-ts";
import useResizeObserver from "use-resize-observer";

export function links() {
  // `links` returns an array of objects whose
  // properties map to the `<link />` component props
  return [{ rel: "stylesheet", href: stylesheetUrl }];
}

export async function loader({ request }: LoaderArgs) {
  const ordersData = await getOrders();
  return json({
    ...ordersData,
    apiEndpoint: process.env.GOROOSTR_ENDPOINT
  });
}

export default function Index() {
  const { data, custom, status_options, apiEndpoint } = useLoaderData();
  const [orders, setOrders] = useState([...data, ...custom]);
  const [customOrders, setCustomOrders] = useState(custom);
  const [channel, setChannel] = useState(null);
  const [shouldReset, setShouldReset] = useState(true);
  const [pusher, setPusher] = useState(null);
  const [orientation, setOrientation] = useState("portrait");
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedOrderGroup, setSelectedOrderGroup] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Navigation loading state
  const [isNavigating, setIsNavigating] = useState(false);
  
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  // All hooks must be called before any conditional returns
  const { ref, width = 1, height = 1 } = useResizeObserver<HTMLDivElement>();

  // Check for existing session on component mount
  useEffect(() => {
    const authCookie = document.cookie
      .split('; ')
      .find(row => row.startsWith('status_auth='));
    
    if (authCookie) {
      const authData = authCookie.split('=')[1];
      try {
        const { expires } = JSON.parse(decodeURIComponent(authData));
        if (new Date(expires) > new Date()) {
          setIsAuthenticated(true);
        } else {
          // Cookie expired, remove it
          document.cookie = 'status_auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        }
      } catch (e) {
        // Invalid cookie, remove it
        document.cookie = 'status_auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      }
    }
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    const correctPassword = "goroostr2024"; // Simple password - should be env var in production
    
    if (password === correctPassword) {
      // Set authentication cookie for 30 days
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 30);
      
      const authData = {
        authenticated: true,
        expires: expirationDate.toISOString()
      };
      
      document.cookie = `status_auth=${encodeURIComponent(JSON.stringify(authData))}; expires=${expirationDate.toUTCString()}; path=/;`;
      setIsAuthenticated(true);
      setAuthError("");
    } else {
      setAuthError("Incorrect password");
      setPassword("");
    }
  };

  const handleLogout = () => {
    document.cookie = 'status_auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    setIsAuthenticated(false);
  };
  useEffect(() => {
    if (window && window.matchMedia("(orientation: portrait)").matches) {
      setOrientation("portrait");
    } else {
      setOrientation("landscape");
    }
  }, [width, height]);

  // Update current time every second
  useEffect(() => {
    // Set initial time
    setCurrentTime(new Date());
    
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000); // Update every second
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (shouldReset) {
      const pusherInstance = new Pusher("8dbf7fe9fc3eebec3913", {
        cluster: "us2",
      });
      pusherInstance.connection.bind("error", function (err) {
        if (err.error.data.code === 4004) {
          alert("Over limit!");
        } else {
          alert(`Pusher Error: ${err.error.data.code}`);
        }
      });
      setPusher(pusherInstance);
      setShouldReset(false);
    }
  }, [shouldReset]);

  useEffect(() => {
    if (pusher && !channel) {
      console.log(
        "============================SUBSCRIBING TO CHANNEL============================"
      );

      setChannel(pusher.subscribe("quotes"));

      console.log(pusher);

      pusher.connection.bind("connected", function () {
        console.log("Pusher Connected");
        setConnectionStatus("connected");
      });
      pusher.connection.bind("error", function (error) {
        console.error("connection error", error);
        setConnectionStatus("error");
      });
      pusher.connection.bind("state_change", function (states) {
        console.log("Pusher state change", states);
        setConnectionStatus(states.current);
      });
      pusher.connection.bind("disconnected", function () {
        console.log("Pusher Disconnected");
        setConnectionStatus("disconnected");
      });
      pusher.connection.bind("failed", function () {
        console.log("Pusher failed");
        setConnectionStatus("failed");
      });
    }
    return () => {
      if (channel && pusher && pusher.connection.state !== "disconnected") {
        console.log(
          "============================UNSUBSCRIBING FROM CHANNEL============================"
        );
        channel.unbind();
        pusher.unsubscribe("quotes");
      }
    };
  }, [channel, pusher]);

  const rebuildSubscripton = useCallback(() => {
    if (channel && pusher) {
      console.log(
        "============================REBUILDING SUBSCRIPTION============================"
      );
      channel.unbind();
      pusher.unsubscribe("quotes");
      pusher.disconnect();
      setChannel(null);
      setPusher(null);
      setShouldReset(true);
    }
  }, [channel, pusher]);

  useInterval(() => {
    const state = pusher.connection.state;
    console.log("Pusher state", state);
    // rebuildSubscripton()
  }, 5000);

  useInterval(async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(
        `${apiEndpoint}/get-status-orders?paginate=false`
      );
      const { data, custom } = await response.json();
      setOrders([...data, ...custom]);
      setCustomOrders(custom);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500); // Show indicator for at least 500ms
    }
  }, 10000);

  const pluck = (property) => (element) => element[property];

  const sortAndOrder = useCallback((data, statusOptionsDirect) => {
    data.forEach((order, i) => {
      data[i].statusKey = order.status_value?.status_option?.key;
    });
    statusOptionsDirect.sort((a, b) => a.order - b.order);
    const keys = statusOptionsDirect.map(pluck("key"));
    const sorted = sortBy(data, function (obj) {
      return indexOf(keys, obj.statusKey);
    });

    return sorted;
  }, []);

  useEffect(() => {
    if (!channel) return;
    channel.bind(`quotes.update`, (response) => {
      console.log(
        "============================ORDER UPDATE============================"
      );

      setOrders((orders) => {
        const data = response;

        const newOrders = [...orders];

        data.quotes.forEach((order, i) => {
          const orderChange = order;
          const orderIndex = orders.findIndex(
            (order) => order.id === orderChange.id
          );
          //Need a check for a new order, sort by the status key on update
          if (orderIndex !== -1) {
            orderChange.quote = newOrders[orderIndex].quote;
            newOrders[orderIndex] = {
              ...newOrders[orderIndex],
              ...orderChange,
            };
          }
        });
        const sorted = sortAndOrder(newOrders, status_options);
        setLastUpdated(new Date());

        return sorted;
      });
    });
  }, [channel, sortAndOrder, status_options]);

  // Show login form if not authenticated (must be after all hooks)
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gr-beige flex items-center justify-center px-4">
        <div className="bg-white p-8 rounded-2xl shadow-md w-full max-w-md border-2 border-gr-black">
          <div className="flex justify-center mb-6">
            <img
              src="/GR_Logo1B.svg"
              alt="GoRoostr"
              className="h-12"
            />
          </div>
          <h2 className="text-xl font-bold text-center text-gr-black mb-6">
            Order Status Screen
          </h2>
          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label htmlFor="password" className="block text-sm font-semibold text-gr-black mb-2">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border-2 border-gr-black rounded-md focus:outline-none focus:ring-2 focus:ring-gr-green bg-white"
                placeholder="Enter password"
                required
              />
            </div>
            {authError && (
              <div className="mb-4 text-red-600 text-sm">
                {authError}
              </div>
            )}
            <button
              type="submit"
              className="w-full bg-gr-green text-gr-black font-bold py-2 px-4 rounded-full border-2 border-gr-black hover:bg-gr-green-hover focus:outline-none focus:ring-2 focus:ring-gr-green focus:ring-offset-2 transition-colors"
            >
              Access Status Screen
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!channel) return null;

  // Calculate total orders
  const totalOrders = orders.length;

  // Format time display  
  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  // Connection status indicator — brand green when live, semantic
  // yellow/red for degraded states so it still reads at a glance.
  const getConnectionColor = () => {
    switch(connectionStatus) {
      case 'connected': return 'bg-gr-green';
      case 'connecting': return 'bg-yellow-400';
      case 'disconnected':
      case 'failed':
      case 'error': return 'bg-red-400';
      default: return 'bg-gr-gray-disabled';
    }
  };

  // Modal handlers
  const handleOrderClick = (order) => {
    setSelectedOrder(order);
    setSelectedOrderGroup(null);
    setIsModalOpen(true);
  };

  const handleGroupClick = (orderGroup, groupType) => {
    setSelectedOrderGroup({ ...orderGroup, groupType });
    setSelectedOrder(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedOrder(null);
    setSelectedOrderGroup(null);
  };

  return (
    <main
      className="relative min-h-screen bg-white flex"
      ref={ref}
    >
      {/* Main Content */}
      <div className="flex items-center justify-center min-h-screen flex-1">
      {orientation === "landscape" ? (
        <>
          <div
            className="grid-container main-grid grid w-full grid-cols-3 gap-0"
          >
            {/* Landscape 3x2 grid — both rows ramp light→dark
                left-to-right, and row 2 sits one shade darker than
                row 1 at each column position. Mirrors the old
                emerald 50/200/400 // 100/300/500 pattern with
                brand-anchored mint tints. */}
            <StatusSection
              color="bg-gr-mint-50"
              orders={orders}
              statusKey={"OD"}
              statusOptions={status_options}
              onOrderClick={handleOrderClick}
              onGroupClick={handleGroupClick}
            />
            <StatusSection
              color="bg-gr-mint-200"
              orders={orders}
              statusKey={"IP"}
              statusOptions={status_options}
              onOrderClick={handleOrderClick}
              onGroupClick={handleGroupClick}
            />
            <StatusSection
              color="bg-gr-mint-400"
              orders={orders}
              statusKey={"PN"}
              statusOptions={status_options}
              onOrderClick={handleOrderClick}
              onGroupClick={handleGroupClick}
            />
            <StatusSection
              color="bg-gr-mint-100"
              orders={orders}
              statusKey={"DL"}
              statusOptions={status_options}
              onOrderClick={handleOrderClick}
              onGroupClick={handleGroupClick}
            />
            <StatusSection
              color="bg-gr-mint-300"
              orders={orders}
              statusKey={"IR"}
              statusOptions={status_options}
              onOrderClick={handleOrderClick}
              onGroupClick={handleGroupClick}
            />
            <StatusSection
              color="bg-gr-mint-500"
              orders={orders}
              statusKey={"PY"}
              statusOptions={status_options}
              onOrderClick={handleOrderClick}
              onGroupClick={handleGroupClick}
            />
          </div>
        </>
      ) : (
        <>
          <div
            className="grid-container main-grid grid w-full grid-cols-2 gap-0"
          >
            {/* Portrait 2x3 grid — column-order layout, so read
                top-to-bottom then left-to-right. Left column ramps
                50/100/200; right column continues 300/400/500. */}
            <StatusSection
              color="bg-gr-mint-50"
              orders={orders}
              statusKey={"OD"}
              statusOptions={status_options}
              onOrderClick={handleOrderClick}
              onGroupClick={handleGroupClick}
            />
            <StatusSection
              color="bg-gr-mint-300"
              orders={orders}
              statusKey={"DL"}
              statusOptions={status_options}
              onOrderClick={handleOrderClick}
              onGroupClick={handleGroupClick}
            />
            <StatusSection
              color="bg-gr-mint-100"
              orders={orders}
              statusKey={"IP"}
              statusOptions={status_options}
              onOrderClick={handleOrderClick}
              onGroupClick={handleGroupClick}
            />
            <StatusSection
              color="bg-gr-mint-400"
              orders={orders}
              statusKey={"IR"}
              statusOptions={status_options}
              onOrderClick={handleOrderClick}
              onGroupClick={handleGroupClick}
            />
            <StatusSection
              color="bg-gr-mint-200"
              orders={orders}
              statusKey={"PN"}
              statusOptions={status_options}
              onOrderClick={handleOrderClick}
              onGroupClick={handleGroupClick}
            />
            <StatusSection
              color="bg-gr-mint-500"
              orders={orders}
              statusKey={"PY"}
              statusOptions={status_options}
              onOrderClick={handleOrderClick}
              onGroupClick={handleGroupClick}
            />
          </div>
        </>
      )}
      </div>
      
      {/* Vertical Sidebar — brand dark green */}
      <div className="w-20 bg-gr-green-dark flex flex-col justify-between p-2 text-white">
        <div className="space-y-2">
          {/* Brand mark. Logo is dark green on white, so we wrap it in
              a subtle beige plate so the "GoRoostr" wordmark still reads
              against the dark green sidebar. */}
          <div className="flex justify-center pt-1 pb-3">
            <div className="bg-gr-beige-light rounded-md px-2 py-1.5 flex items-center justify-center">
              <img
                src="/GR_Logo1B.svg"
                alt="GoRoostr"
                className="h-5"
              />
            </div>
          </div>

          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${getConnectionColor()}`}></div>
              {isRefreshing && (
                <div className="w-2 h-2">
                  <svg className="animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              )}
            </div>
            <span className="text-xs font-semibold text-gr-green">LIVE</span>
          </div>

          {/* Navigation */}
          <div className="py-4 border-t border-b border-gr-dark-hover">
            <div className="p-2 text-white bg-gr-dark-hover rounded" title="Dashboard View (Current)">
              <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </div>
            <Link
              to="/list-view"
              className="block p-2 mt-1 text-gr-beige-light hover:text-white hover:bg-gr-dark-hover rounded transition-colors"
              title="List View"
              onClick={() => setIsNavigating(true)}
            >
              {isNavigating ? (
                <svg className="w-4 h-4 mx-auto animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              )}
            </Link>
            {/* Shipping wall — 40" TV read-only view of Pending +
                Shipped Today. Package/box icon. */}
            <Link
              to="/pending-shipments"
              className="block p-2 mt-1 text-gr-beige-light hover:text-white hover:bg-gr-dark-hover rounded transition-colors"
              title="Shipping Wall — Pending + Shipped Today"
            >
              <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8l1-4h12l1 4M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8M10 12h4" />
              </svg>
            </Link>
            {/* Shipping Work — interactive companion where shippers
                pick, confirm, print labels. Check-in-circle icon. */}
            <Link
              to="/pending-shipments-work"
              className="block p-2 mt-1 text-gr-beige-light hover:text-white hover:bg-gr-dark-hover rounded transition-colors"
              title="Shipping Work — pick, confirm, print"
            >
              <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </Link>
          </div>

          <div className="text-xs space-y-2 text-center">
            <div>
              <div className="text-gr-beige-light text-xs">Updated</div>
              <div className="font-semibold text-xs">{formatTime(lastUpdated)}</div>
            </div>

            <div>
              <div className="text-gr-beige-light text-xs">Total</div>
              <div className="font-bold text-sm">{totalOrders}</div>
            </div>
          </div>
        </div>

        <div className="text-center space-y-2">
          <div className="text-lg font-bold">
            {currentTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' AM', '').replace(' PM', '')}
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-gr-beige-light hover:text-white transition-colors"
            title="Logout"
          >
            ⚠
          </button>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-gr-black bg-opacity-60 flex items-center justify-center z-50 px-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl p-6 max-w-4xl max-h-[90vh] overflow-y-auto border-2 border-gr-black shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold">
                  {selectedOrderGroup ? (
                    selectedOrderGroup.groupType === 'ITAD'
                      ? `ITAD Lot ${selectedOrderGroup.orders[0]?.itad_lot?.arc_pu || `#${selectedOrderGroup.itad_lot_id}`}`
                      : `${selectedOrderGroup.groupType} Order Group #${selectedOrderGroup.order_id}`
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        {/* Working Status Indicator */}
                        <div className={`w-3 h-3 rounded-full ${JSON.parse(selectedOrder?.model_info || '{}').working_status === 'working' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        
                        {/* Item Link */}
                        {selectedOrder.custom ? (
                          <a 
                            href={`https://api.goroostr.com/nova/resources/custom-order-items/${selectedOrder?.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-purple-600 hover:text-purple-800 hover:underline"
                          >
                            Item #{selectedOrder?.id}
                          </a>
                        ) : (
                          <a 
                            href={`https://api.goroostr.com/nova/resources/quotes/${selectedOrder?.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-green-600 hover:text-green-800 hover:underline"
                          >
                            Item #{selectedOrder?.id}
                          </a>
                        )}
                        
                        {/* Current Status */}
                        <span className="text-lg text-gray-600">
                          • {selectedOrder?.status_value?.status_option?.name}
                        </span>
                      </div>
                      {selectedOrder && (
                        <div className="text-lg flex items-center gap-4">
                          {/* Order Number Link */}
                          {selectedOrder.custom ? (
                            <a 
                              href={`https://api.goroostr.com/nova/resources/customs/${selectedOrder.custom.id || selectedOrder.custom_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-orange-600 hover:text-orange-800 hover:underline"
                            >
                              Custom Order #{selectedOrder.custom.id || selectedOrder.custom_id}
                            </a>
                          ) : selectedOrder.bulk_order ? (
                            <a 
                              href={`https://api.goroostr.com/nova/resources/bulk-orders/${selectedOrder.bulk_order.id || selectedOrder.bulk_order_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-600 hover:text-indigo-800 hover:underline"
                            >
                              Bulk Order #{selectedOrder.bulk_order.id || selectedOrder.bulk_order_id}
                            </a>
                          ) : selectedOrder.order ? (
                            <a 
                              href={`https://api.goroostr.com/nova/resources/orders/${selectedOrder.order.id || selectedOrder.order_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-teal-600 hover:text-teal-800 hover:underline"
                            >
                              Order #{selectedOrder.order.id || selectedOrder.order_id}
                            </a>
                          ) : null}

                          {/* Order Item Link */}
                          {selectedOrder.order_item_id && (
                            <a 
                              href={`https://api.goroostr.com/nova/resources/order-items/${selectedOrder.order_item_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              Order Item #{selectedOrder.order_item_id}
                            </a>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </h2>
              </div>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-700 text-3xl">
                ×
              </button>
            </div>
            
            {selectedOrder && (
              <div className="space-y-6">
                {/* Order Overview */}
                <div className="bg-gr-beige-light p-4 rounded-lg">
                  <h3 className="text-lg font-bold mb-3 text-gr-black">Order Overview</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Customer Name */}
                    <div>
                      <span className="text-sm text-gr-gray-disabled">Customer</span>
                      <div className="font-semibold text-gr-black">
                        {selectedOrder.custom ?
                          (selectedOrder.custom.company || `${selectedOrder.custom.first_name} ${selectedOrder.custom.last_name}`) :
                          selectedOrder.bulk_order ?
                          (selectedOrder.bulk_order.company || `${selectedOrder.bulk_order.first_name} ${selectedOrder.bulk_order.last_name}`) :
                          selectedOrder.order ?
                          (selectedOrder.order.company || `${selectedOrder.order.first_name} ${selectedOrder.order.last_name}`) :
                          'Unknown Customer'
                        }
                      </div>
                    </div>

                    {/* Pricing - Only show for non-custom orders */}
                    {!selectedOrder.custom && selectedOrder.value && (
                      <div>
                        <span className="text-sm text-gr-gray-disabled">Quote Value</span>
                        <div className="font-bold text-gr-green-dark">
                          ${parseFloat(selectedOrder.value).toFixed(2)}
                        </div>
                      </div>
                    )}

                    {!selectedOrder.custom && selectedOrder.total && (
                      <div>
                        <span className="text-sm text-gr-gray-disabled">Total</span>
                        <div className="font-bold text-gr-green-dark">
                          ${parseFloat(selectedOrder.total).toFixed(2)}
                        </div>
                      </div>
                    )}

                    {!selectedOrder.custom && (selectedOrder.discount_amount || selectedOrder.discount) && (
                      <div>
                        <span className="text-sm text-gr-gray-disabled">Discount</span>
                        <div className="font-semibold text-red-600">
                          -${parseFloat(selectedOrder.discount_amount || selectedOrder.discount).toFixed(2)}
                        </div>
                      </div>
                    )}

                    {!selectedOrder.custom && selectedOrder.tax_amount && (
                      <div>
                        <span className="text-sm text-gr-gray-disabled">Tax</span>
                        <div className="font-semibold text-gr-black">
                          ${parseFloat(selectedOrder.tax_amount).toFixed(2)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Product Details */}
                <div className="bg-white border border-gr-beige-light rounded-lg p-4">
                  <h3 className="text-lg font-bold mb-3 text-gr-black">Product Details</h3>
                  <div className="space-y-3">
                    <div>
                      <span className="text-sm text-gray-600">Description</span>
                      <div className="font-medium">{selectedOrder.model_desc}</div>
                    </div>
                    
                    {selectedOrder.details && (
                      <details className="bg-gray-50 rounded-lg p-3">
                        <summary className="text-sm font-medium text-gray-700 cursor-pointer hover:text-gray-900 select-none">
                          Additional Details
                        </summary>
                        <div className="mt-3 space-y-3">
                          {(() => {
                            try {
                              const details = typeof selectedOrder.details === 'string' ? JSON.parse(selectedOrder.details) : selectedOrder.details;
                              return Object.entries(details).map(([key, value]) => (
                                <div key={key} className="flex flex-col sm:flex-row sm:gap-4 py-2 border-b border-gray-200 last:border-b-0">
                                  <div className="text-xs text-gray-500 sm:w-40 font-semibold uppercase tracking-wide">
                                    {key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim()}
                                  </div>
                                  <div className="text-sm text-gray-800 flex-1">
                                    {typeof value === 'boolean' ? (
                                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                                        value ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                      }`}>
                                        {value ? 'Yes' : 'No'}
                                      </span>
                                    ) : typeof value === 'object' ? (
                                      <div className="text-xs bg-white p-2 rounded border">
                                        <pre className="whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
                                      </div>
                                    ) : (
                                      <span className="font-medium">{String(value)}</span>
                                    )}
                                  </div>
                                </div>
                              ));
                            } catch (e) {
                              return <div className="text-sm text-gray-600">{String(selectedOrder.details)}</div>;
                            }
                          })()}
                        </div>
                      </details>
                    )}

                    {selectedOrder.model_info && (
                      <details className="bg-gray-50 rounded-lg p-3">
                        <summary className="text-sm font-medium text-gray-700 cursor-pointer hover:text-gray-900 select-none">
                          Technical Information
                        </summary>
                        <div className="mt-3 space-y-3">
                          {(() => {
                            try {
                              const techInfo = JSON.parse(selectedOrder.model_info);
                              return Object.entries(techInfo).map(([key, value]) => (
                                <div key={key} className="flex flex-col sm:flex-row sm:gap-4 py-2 border-b border-gray-200 last:border-b-0">
                                  <div className="text-xs text-gray-500 sm:w-40 font-semibold uppercase tracking-wide">
                                    {key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim()}
                                  </div>
                                  <div className="text-sm text-gray-800 flex-1">
                                    {typeof value === 'boolean' ? (
                                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                                        value ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                      }`}>
                                        {value ? 'Yes' : 'No'}
                                      </span>
                                    ) : typeof value === 'object' ? (
                                      <div className="text-xs bg-white p-2 rounded border">
                                        <pre className="whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
                                      </div>
                                    ) : (
                                      <span className="font-medium">{String(value)}</span>
                                    )}
                                  </div>
                                </div>
                              ));
                            } catch (e) {
                              return <div className="text-sm text-gray-600">Unable to parse technical information</div>;
                            }
                          })()}
                        </div>
                      </details>
                    )}
                  </div>
                </div>

                {/* Notes Section */}
                {selectedOrder.notes && Array.isArray(selectedOrder.notes) && selectedOrder.notes.length > 0 && (
                  <div className="bg-white border rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-3">Notes</h3>
                    <div className="space-y-3">
                      {selectedOrder.notes.map((note, index) => (
                        <div key={index} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-medium text-amber-800">
                                {typeof note.user === 'object' ? note.user?.name || note.user?.email || 'System' : 
                                 typeof note.author === 'object' ? note.author?.name || note.author?.email || 'System' : 
                                 note.user || note.author || 'System'}
                              </div>
                              {note.tag && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-200 text-amber-800">
                                  {typeof note.tag === 'object' ? note.tag?.name || note.tag?.label || note.tag : note.tag}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-amber-600">
                              {note.created_at ? new Date(note.created_at).toLocaleString() : 'Unknown date'}
                            </div>
                          </div>
                          <div className="text-sm text-amber-900">
                            {note.content || note.note || note.message || note.text || 'No content'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Status History Section */}
                {selectedOrder.status_history && selectedOrder.status_history.length > 0 && (
                  <div className="bg-white border rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-3">Status History</h3>
                    <div className="space-y-3">
                      {selectedOrder.status_history
                        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
                        .map((status, index) => (
                        <div key={index} className="flex items-start gap-4 p-3 bg-gray-50 rounded-lg">
                          <div className="flex-shrink-0">
                            <div className={`w-3 h-3 rounded-full ${
                              index === 0 ? 'bg-green-500' : 'bg-gray-400'
                            }`}></div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start mb-1">
                              <div className="text-sm font-semibold text-gray-900">
                                {typeof status.status_option === 'object' ? status.status_option?.name || status.status_option?.label :
                                 typeof status.status === 'object' ? status.status?.name || status.status?.label :
                                 status.status_name || status.name || status.status || status.label || 'Unknown Status'}
                              </div>
                              <div className="text-xs text-gray-500 ml-2">
                                {status.created_at ? new Date(status.created_at).toLocaleString() : 'Unknown date'}
                              </div>
                            </div>
                            {status.note && (
                              <div className="text-sm text-gray-600 mt-1">
                                {status.note}
                              </div>
                            )}
                            {status.user && (
                              <div className="text-xs text-gray-500 mt-1">
                                Changed by: {typeof status.user === 'object' ? status.user?.name || status.user?.email || 'Unknown' : status.user}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Raw Data (for debugging/detailed view) */}
                <details className="bg-gray-50 border rounded-lg p-4">
                  <summary className="text-sm font-medium text-gray-600 cursor-pointer hover:text-gray-800">
                    View Raw Order Data
                  </summary>
                  <div className="mt-3 text-xs bg-white p-3 rounded border overflow-auto max-h-60">
                    <pre className="whitespace-pre-wrap">{JSON.stringify(selectedOrder, null, 2)}</pre>
                  </div>
                </details>
              </div>
            )}

            {selectedOrderGroup && (
              <div className="space-y-4">
                <div className="bg-gray-50 p-3 rounded">
                  <div className="font-semibold">Group ID: {selectedOrderGroup.groupType === 'ITAD' ? (selectedOrderGroup.orders[0]?.itad_lot?.arc_pu || selectedOrderGroup.itad_lot_id) : selectedOrderGroup.order_id}</div>
                  <div>Customer: {selectedOrderGroup.groupType === 'ITAD'
                    ? `ITAD Lot ${selectedOrderGroup.orders[0]?.itad_lot?.arc_pu || selectedOrderGroup.itad_lot_id}`
                    : (selectedOrderGroup.orders[0]?.[selectedOrderGroup.groupType === 'Bulk' ? 'bulk_order' : 'custom']?.company || `${selectedOrderGroup.orders[0]?.[selectedOrderGroup.groupType === 'Bulk' ? 'bulk_order' : 'custom']?.first_name} ${selectedOrderGroup.orders[0]?.[selectedOrderGroup.groupType === 'Bulk' ? 'bulk_order' : 'custom']?.last_name}`)}</div>
                  <div>Items in group: {selectedOrderGroup.orders.length}</div>
                </div>
                
                <div>
                  <h3 className="font-semibold mb-2">Items in this group:</h3>
                  <div className="space-y-2">
                    {selectedOrderGroup.orders.map((order) => (
                      <div 
                        key={order.id} 
                        className="border p-3 rounded bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => handleOrderClick(order)}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium">ID: {order.id}</div>
                            <div className="text-sm text-gray-600">{order.model_desc || order.description}</div>
                          </div>
                          <div className="text-sm font-medium text-gray-800">
                            {order.status_value?.status_option?.name}
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 mt-2 text-right">
                          Click to view details →
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
