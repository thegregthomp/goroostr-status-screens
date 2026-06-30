import React, { useState, useCallback, useEffect } from "react";
import type { LoaderArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { json } from "@remix-run/node";
import stylesheetUrl from "../styles/global.css";
import { getOrders } from "~/models/orders.server";
import Pusher from "pusher-js";
import sortBy from "lodash/sortBy";
import indexOf from "lodash/indexOf";
import { useInterval } from "usehooks-ts";
import { DateTime } from "luxon";

export function links() {
  return [{ rel: "stylesheet", href: stylesheetUrl }];
}

export async function loader({ request }: LoaderArgs) {
  const ordersData = await getOrders();
  return json({
    ...ordersData,
    apiEndpoint: process.env.GOROOSTR_ENDPOINT
  });
}

export default function ListView() {
  const { data, custom, status_options, apiEndpoint } = useLoaderData();
  const [orders, setOrders] = useState([...data, ...custom]);
  const [customOrders, setCustomOrders] = useState(custom);
  const [channel, setChannel] = useState(null);
  const [shouldReset, setShouldReset] = useState(true);
  const [pusher, setPusher] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedOrderGroup, setSelectedOrderGroup] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Status visibility state - all 6 main statuses visible by default
  const [visibleStatuses, setVisibleStatuses] = useState({
    'OD': true, // Out for Delivery
    'IP': true, // In Progress
    'PN': true, // Print Next
    'DL': true, // Delivered
    'IR': true, // In Review
    'PY': true  // Ready for Payment
  });
  
  // Dropdown state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  // Navigation loading state
  const [isNavigating, setIsNavigating] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isDropdownOpen && !event.target.closest('.dropdown-container')) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);
  
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

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
    const correctPassword = "goroostr2024";
    
    if (password === correctPassword) {
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

  // Update current time every second
  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
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
      console.log("============================SUBSCRIBING TO CHANNEL============================");
      setChannel(pusher.subscribe("quotes"));

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
        console.log("============================UNSUBSCRIBING FROM CHANNEL============================");
        channel.unbind();
        pusher.unsubscribe("quotes");
      }
    };
  }, [channel, pusher]);

  const rebuildSubscripton = useCallback(() => {
    if (channel && pusher) {
      console.log("============================REBUILDING SUBSCRIPTION============================");
      channel.unbind();
      pusher.unsubscribe("quotes");
      pusher.disconnect();
      setChannel(null);
      setPusher(null);
      setShouldReset(true);
    }
  }, [channel, pusher]);

  useInterval(async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(`${apiEndpoint}/get-status-orders`);
      const { data, custom } = await response.json();
      setOrders([...data, ...custom]);
      setCustomOrders(custom);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
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
      console.log("============================ORDER UPDATE============================");

      setOrders((orders) => {
        const data = response;
        const newOrders = [...orders];

        data.quotes.forEach((order, i) => {
          const orderChange = order;
          const orderIndex = orders.findIndex(
            (order) => order.id === orderChange.id
          );
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

  // Show login form if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">
            Status Screen Access
          </h2>
          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
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

  // Connection status indicator
  const getConnectionColor = () => {
    switch(connectionStatus) {
      case 'connected': return 'bg-green-400';
      case 'connecting': return 'bg-yellow-400';
      case 'disconnected': 
      case 'failed':
      case 'error': return 'bg-red-400';
      default: return 'bg-gray-400';
    }
  };

  // Status icon mapping
  const getStatusIcon = (statusKey) => {
    switch (statusKey) {
      case 'OD': return '🚚';
      case 'IP': return '⚡';
      case 'PN': return '📋';
      case 'DL': return '✅';
      case 'IR': return '🔄';
      case 'PY': return '💰';
      default: return '📦';
    }
  };

  // Status color mapping
  const getStatusColor = (statusKey) => {
    switch (statusKey) {
      case 'OD': return 'bg-emerald-50 border-emerald-200';
      case 'IP': return 'bg-emerald-200 border-emerald-300';
      case 'PN': return 'bg-emerald-400 border-emerald-500';
      case 'DL': return 'bg-emerald-100 border-emerald-200';
      case 'IR': return 'bg-emerald-300 border-emerald-400';
      case 'PY': return 'bg-emerald-500 border-emerald-600';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  // Payment type mapping with branded colors and icons
  const getPaymentType = (paymentType) => {
    switch (paymentType) {
      case "paypal":
        return { 
          name: "PayPal", 
          color: "bg-blue-50 text-blue-700 border-blue-300", 
          icon: "💳" 
        };
      case "check":
        return { 
          name: "Check", 
          color: "bg-green-50 text-green-700 border-green-300", 
          icon: "📝" 
        };
      case "venmo":
        return { 
          name: "Venmo", 
          color: "bg-sky-50 text-sky-700 border-sky-300", 
          icon: "💸" 
        };
      case "zelle":
        return { 
          name: "Zelle", 
          color: "bg-purple-50 text-purple-700 border-purple-300", 
          icon: "⚡" 
        };
      case "wire":
        return { 
          name: "Wire", 
          color: "bg-orange-50 text-orange-700 border-orange-300", 
          icon: "🏦" 
        };
      default:
        return paymentType ? { 
          name: paymentType.charAt(0).toUpperCase() + paymentType.slice(1), 
          color: "bg-gray-50 text-gray-700 border-gray-300",
          icon: "💰"
        } : null;
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

  // Toggle status visibility
  const toggleStatusVisibility = (statusKey) => {
    setVisibleStatuses(prev => ({
      ...prev,
      [statusKey]: !prev[statusKey]
    }));
  };

  // Get visible count for dropdown display
  const visibleCount = Object.values(visibleStatuses).filter(Boolean).length;
  
  // Toggle all statuses
  const toggleAllStatuses = (show) => {
    const newState = {};
    ['OD', 'DL', 'IP', 'IR', 'PN', 'PY'].forEach(key => {
      newState[key] = show;
    });
    setVisibleStatuses(newState);
  };

  // Group orders by status and type
  const statusOrder = ['OD', 'DL', 'IP', 'IR', 'PN', 'PY'];
  const ordersByStatus = statusOrder
    .map(statusKey => {
      const status = status_options.find(s => s.key === statusKey);
      if (!status) return null;
      const statusOrders = orders.filter(order => order.status_value?.status_option?.key === status.key);
      
      // Separate orders by type
      const regularOrders = statusOrders.filter(order => !order.bulk_order && !order.custom && !order.itad_lot_id);
      const bulkOrders = statusOrders.filter(order => order.bulk_order);
      const customOrders = statusOrders.filter(order => order.custom);
      // ITAD assets: CustomOrderItems parented to an itad_lot (no custom parent)
      const itadOrders = statusOrders.filter(order => order.itad_lot_id);
      
      // Group bulk orders by order_id
      const bulkGroups = [];
      const bulkOrderMap = {};
      bulkOrders.forEach(order => {
        const orderId = order.order_id || order.bulk_order?.id;
        if (!bulkOrderMap[orderId]) {
          bulkOrderMap[orderId] = {
            order_id: orderId,
            orders: [],
            type: 'bulk'
          };
          bulkGroups.push(bulkOrderMap[orderId]);
        }
        bulkOrderMap[orderId].orders.push(order);
      });
      
      // Group custom orders by order_id
      const customGroups = [];
      const customOrderMap = {};
      customOrders.forEach(order => {
        const orderId = order.order_id || order.custom?.id;
        if (!customOrderMap[orderId]) {
          customOrderMap[orderId] = {
            order_id: orderId,
            orders: [],
            type: 'custom'
          };
          customGroups.push(customOrderMap[orderId]);
        }
        customOrderMap[orderId].orders.push(order);
      });

      // Group ITAD assets by their lot
      const itadGroups = [];
      const itadMap = {};
      itadOrders.forEach(order => {
        const lotId = order.itad_lot_id;
        if (!itadMap[lotId]) {
          itadMap[lotId] = { itad_lot_id: lotId, lot: order.itad_lot, orders: [], type: 'itad' };
          itadGroups.push(itadMap[lotId]);
        }
        itadMap[lotId].orders.push(order);
      });

      return {
        ...status,
        regularOrders,
        bulkGroups,
        customGroups,
        itadGroups,
        totalOrders: statusOrders.length
      };
    })
    .filter(Boolean); // Remove any null entries

  return (
    <main className="relative min-h-screen bg-gray-100">
      {/* Main Content */}
      <div className="p-4 pr-24">
        <div className="w-full">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Order Status List</h1>
          
          {/* Status Filter Dropdown */}
          <div className="bg-white rounded-lg p-3 mb-4 shadow-sm border">
            <div className="flex items-center justify-end">
              <div className="relative dropdown-container">
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded border text-sm font-medium text-gray-700 transition-colors"
                >
                  <span>{visibleCount} of 6 selected</span>
                  <svg className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {isDropdownOpen && (
                  <div className="absolute right-0 mt-1 w-64 bg-white border rounded-lg shadow-lg z-10">
                    <div className="p-2 border-b">
                      <div className="flex gap-2">
                        <button
                          onClick={() => toggleAllStatuses(true)}
                          className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                        >
                          Select All
                        </button>
                        <button
                          onClick={() => toggleAllStatuses(false)}
                          className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                        >
                          Clear All
                        </button>
                      </div>
                    </div>
                    <div className="p-2 max-h-48 overflow-y-auto">
                      {['OD', 'DL', 'IP', 'IR', 'PN', 'PY'].map((statusKey) => {
                        const status = status_options.find(s => s.key === statusKey);
                        const orderCount = ordersByStatus.find(s => s.key === statusKey)?.totalOrders || 0;

                        // Fallback name if status not found in options
                        const statusName = status?.name || {
                          'OD': 'Out for Delivery',
                          'DL': 'Delivered',
                          'IP': 'In Process',
                          'IR': 'In Review',
                          'PN': 'Pending',
                          'PY': 'Ready for Payment'
                        }[statusKey];
                        
                        return (
                          <label key={statusKey} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={visibleStatuses[statusKey] || false}
                              onChange={() => toggleStatusVisibility(statusKey)}
                              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                            />
                            <span className="text-sm">{getStatusIcon(statusKey)}</span>
                            <span className="text-sm font-medium text-gray-700 flex-1">
                              {statusName}
                            </span>
                            <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
                              {orderCount}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Status Sections */}
          <div className="space-y-6">
            {ordersByStatus.map((status) => {
              if (status.totalOrders === 0 || !visibleStatuses[status.key]) return null;
              
              // Calculate total value for this status (regular orders + grouped items)
              let totalValue = 0;
              
              // Add regular orders
              totalValue += status.regularOrders.reduce((sum, order) => {
                const value = parseFloat(order.total || order.value || 0);
                return sum + value;
              }, 0);
              
              // Add bulk order groups
              totalValue += status.bulkGroups.reduce((sum, group) => {
                const groupValue = group.orders.reduce((groupSum, order) => {
                  const value = parseFloat(order.total || order.value || 0);
                  return groupSum + value;
                }, 0);
                return sum + groupValue;
              }, 0);
              
              // Custom orders typically don't have monetary values, so we skip them

              return (
                <div key={status.key} className={`border-2 rounded-lg p-4 ${getStatusColor(status.key)}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getStatusIcon(status.key)}</span>
                      <h2 className="text-lg font-bold text-gray-800">{status.name}</h2>
                      <span className="bg-white px-2 py-0.5 rounded-full text-xs font-semibold text-gray-700 border">
                        {status.totalOrders}
                      </span>
                    </div>
                    {totalValue > 0 && (
                      <div className="bg-white px-3 py-1.5 rounded-lg shadow-sm border">
                        <div className="text-base font-bold text-green-600">
                          ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-3 gap-1.5">
                    {/* Bulk Order Groups (only show as group if more than 1 item) */}
                    {status.bulkGroups.map((group) => {
                      const firstOrder = group.orders[0];
                      // Partner trade-ins are bulk orders with type 'trade_in' —
                      // render rose + the partner name to set them apart.
                      const isTradeIn = firstOrder.bulk_order?.type === 'trade_in';
                      const customerName = (isTradeIn && firstOrder.bulk_order?.partner?.name)
                        ? firstOrder.bulk_order.partner.name
                        : (firstOrder.bulk_order?.company || `${firstOrder.bulk_order?.first_name} ${firstOrder.bulk_order?.last_name}`);
                      
                      // If only 1 item, treat as regular order
                      if (group.orders.length === 1) {
                        const order = firstOrder;
                        const modelInfo = order.model_info ? JSON.parse(order.model_info) : { working_status: "working" };
                        const orderDetails = order.bulk_order;
                        const _md = order.model_desc || order.description || "";
                        const orderString = _md.length > 80 ? _md.substr(0, 80) + "…" : _md;
                        const statusDate = order.status_value.created_at ? DateTime.fromSQL(order.status_value.created_at) : DateTime.now();
                        const now = DateTime.now();
                        const daysInStatus = Math.ceil(now.diff(statusDate, ["days"]).toObject().days);
                        
                        return (
                          <div 
                            key={`bulk-single-${order.id}`}
                            className="bg-white rounded p-1.5 shadow-sm border cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => handleOrderClick(order)}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1 mb-1">
                                  <div className={`w-2 h-2 rounded-full ${modelInfo.working_status === "working" ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                  <span className="text-sm font-bold text-gray-800">#{order.id}</span>
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${isTradeIn ? 'bg-rose-100 text-rose-800' : 'bg-purple-100 text-purple-800'}`}>
                                    B#{orderDetails.id}
                                  </span>
                                  {daysInStatus > 2 && (
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${
                                      daysInStatus > 5 ? 'bg-red-100 text-red-800' : 
                                      daysInStatus > 3 ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800'
                                    }`}>
                                      {daysInStatus}d
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-700 font-medium mb-0.5 truncate">{orderString}</p>
                                <div className="text-xs text-gray-600">
                                  <span className="font-medium">Customer: </span>
                                  <span className="truncate">{customerName}</span>
                                </div>
                              </div>
                              <div className="text-right ml-2 flex-shrink-0">
                                {order.value && (
                                  <div className="mb-1">
                                    <div className="text-base font-bold text-green-600">${parseFloat(order.value).toFixed(2)}</div>
                                    {order.total && (
                                      <div className="text-base font-bold text-blue-600">${parseFloat(order.total).toFixed(2)}</div>
                                    )}
                                  </div>
                                )}
                                {(() => {
                                  const paymentType = order.payment_type || order.bulk_order?.payment_type;
                                  const displayPaymentType = getPaymentType(paymentType);
                                  return displayPaymentType && (
                                    <div>
                                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold border ${displayPaymentType.color}`}>
                                        <span className="text-xs">{displayPaymentType.icon}</span>
                                        {displayPaymentType.name}
                                      </span>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        );
                      }
                      
                      // Multiple items - show as group with total value
                      const groupValue = group.orders.reduce((sum, order) => {
                        const value = parseFloat(order.total || order.value || 0);
                        return sum + value;
                      }, 0);
                      
                      return (
                        <div 
                          key={`bulk-${group.order_id}`}
                          className={`${isTradeIn ? 'bg-rose-100 border-rose-200' : 'bg-purple-100 border-purple-200'} border rounded p-1.5 shadow-sm cursor-pointer hover:shadow-md transition-shadow`}
                          onClick={() => handleGroupClick(group, 'Bulk')}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 mb-1">
                                <div className={`w-2 h-2 rounded-full ${isTradeIn ? 'bg-rose-500' : 'bg-purple-500'}`}></div>
                                <span className="text-sm font-bold text-gray-800">#{group.order_id}</span>
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${isTradeIn ? 'bg-rose-200 text-rose-800' : 'bg-purple-200 text-purple-800'}`}>
                                  {isTradeIn ? 'Trade-In' : 'Bulk'}
                                </span>
                              </div>
                              <p className="text-xs text-gray-700 font-medium mb-0.5 truncate">{customerName}</p>
                              <div className="text-xs text-gray-600">
                                <span className="font-medium">{group.orders.length} items</span>
                              </div>
                            </div>
                            <div className="text-right ml-2 flex-shrink-0">
                              {groupValue > 0 && (
                                <div className="text-base font-bold text-green-600">
                                  ${groupValue.toFixed(2)}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Custom Order Groups (only show as group if more than 1 item) */}
                    {status.customGroups.map((group) => {
                      const firstOrder = group.orders[0];
                      const customerName = firstOrder.custom?.company || `${firstOrder.custom?.first_name} ${firstOrder.custom?.last_name}`;
                      
                      // If only 1 item, treat as regular order
                      if (group.orders.length === 1) {
                        const order = firstOrder;
                        const modelInfo = order.model_info ? JSON.parse(order.model_info) : { working_status: "working" };
                        const orderDetails = order.custom;
                        const orderString = customerName;
                        const statusDate = order.status_value.created_at ? DateTime.fromSQL(order.status_value.created_at) : DateTime.now();
                        const now = DateTime.now();
                        const daysInStatus = Math.ceil(now.diff(statusDate, ["days"]).toObject().days);
                        
                        return (
                          <div 
                            key={`custom-single-${order.id}`}
                            className="bg-white rounded p-1.5 shadow-sm border cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => handleOrderClick(order)}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1 mb-1">
                                  <div className={`w-2 h-2 rounded-full ${modelInfo.working_status === "working" ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                  <span className="text-sm font-bold text-gray-800">#{order.order_id || order.custom?.id} - {order.id}</span>
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    Custom
                                  </span>
                                  {daysInStatus > 2 && (
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${
                                      daysInStatus > 5 ? 'bg-red-100 text-red-800' : 
                                      daysInStatus > 3 ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800'
                                    }`}>
                                      {daysInStatus}d
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-700 font-medium mb-1 truncate">{order.model_desc}</p>
                                <div className="text-xs text-gray-600 mb-1">
                                  <span className="font-medium">Customer: </span>
                                  <span className="truncate">{customerName}</span>
                                </div>
                              </div>
                              <div className="text-right ml-2 flex-shrink-0">
                                {(() => {
                                  const paymentType = order.payment_type || order.custom?.payment_type;
                                  const displayPaymentType = getPaymentType(paymentType);
                                  return displayPaymentType && (
                                    <div>
                                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold border ${displayPaymentType.color}`}>
                                        <span className="text-xs">{displayPaymentType.icon}</span>
                                        {displayPaymentType.name}
                                      </span>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        );
                      }
                      
                      // Multiple items - show as group (custom orders typically don't have values)
                      return (
                        <div 
                          key={`custom-${group.order_id}`}
                          className="bg-blue-100 border border-blue-200 rounded p-1.5 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => handleGroupClick(group, 'Custom')}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 mb-1">
                                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                <span className="text-sm font-bold text-gray-800">#{group.order_id}</span>
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-200 text-blue-800">
                                  Custom
                                </span>
                              </div>
                              <p className="text-xs text-gray-700 font-medium mb-0.5 truncate">{customerName}</p>
                              <div className="text-xs text-gray-600">
                                <span className="font-medium">{group.orders.length} items</span>
                              </div>
                            </div>
                            <div className="text-right ml-2 flex-shrink-0">
                              <div className="text-xs text-gray-500">
                                <div className="font-medium">Custom</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* ITAD Asset Groups (by lot) */}
                    {status.itadGroups.map((group) => {
                      const firstOrder = group.orders[0];
                      const lotLabel = firstOrder.itad_lot?.arc_pu || `Lot #${group.itad_lot_id}`;

                      // Single item — one card
                      if (group.orders.length === 1) {
                        const order = firstOrder;
                        const modelInfo = order.model_info ? JSON.parse(order.model_info) : { working_status: "working" };
                        const statusDate = order.status_value.created_at ? DateTime.fromSQL(order.status_value.created_at) : DateTime.now();
                        const now = DateTime.now();
                        const daysInStatus = Math.ceil(now.diff(statusDate, ["days"]).toObject().days);
                        const _md = order.model_desc || order.description || "";
                        const orderString = _md.length > 80 ? _md.substr(0, 80) + "…" : _md;
                        return (
                          <div
                            key={`itad-single-${order.id}`}
                            className="bg-white rounded p-1.5 shadow-sm border cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => handleOrderClick(order)}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1 mb-1">
                                  <div className={`w-2 h-2 rounded-full ${modelInfo.working_status === "working" ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                  <span className="text-sm font-bold text-gray-800">#{lotLabel} - {order.id}</span>
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
                                    ITAD
                                  </span>
                                  {daysInStatus > 2 && (
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${
                                      daysInStatus > 5 ? 'bg-red-100 text-red-800' :
                                      daysInStatus > 3 ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800'
                                    }`}>
                                      {daysInStatus}d
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-700 font-medium mb-1 truncate">{orderString}</p>
                                <div className="text-xs text-gray-600 mb-1">
                                  <span className="font-medium">Lot: </span>
                                  <span className="truncate">{lotLabel}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      // Multiple items — group card
                      return (
                        <div
                          key={`itad-${group.itad_lot_id}`}
                          className="bg-teal-100 border border-teal-200 rounded p-1.5 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => handleGroupClick(group, 'ITAD')}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 mb-1">
                                <div className="w-2 h-2 rounded-full bg-teal-500"></div>
                                <span className="text-sm font-bold text-gray-800">{lotLabel}</span>
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-teal-200 text-teal-800">
                                  ITAD
                                </span>
                              </div>
                              <p className="text-xs text-gray-700 font-medium mb-0.5 truncate">{lotLabel}</p>
                              <div className="text-xs text-gray-600">
                                <span className="font-medium">{group.orders.length} items</span>
                              </div>
                            </div>
                            <div className="text-right ml-2 flex-shrink-0">
                              <div className="text-xs text-gray-500">
                                <div className="font-medium">ITAD</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Regular Orders */}
                    {status.regularOrders.map((order) => {
                      const isCustom = false; // These are regular orders
                      const isBulk = false;
                      
                      let modelInfo, orderDetails, orderString;
                      
                      if (isCustom) {
                        modelInfo = order.model_info ? JSON.parse(order.model_info) : { working_status: "working" };
                        orderDetails = order.custom;
                        orderString = orderDetails.company || `${orderDetails.first_name} ${orderDetails.last_name}`;
                      } else {
                        modelInfo = order.model_info ? JSON.parse(order.model_info) : { working_status: "working" };
                        orderDetails = isBulk ? order.bulk_order : order.order;
                        orderString = order.model_desc || order.description || "";
                        if (orderString.length > 80) {
                          orderString = orderString.substr(0, 80) + "…";
                        }
                      }
                      
                      const statusDate = order.status_value.created_at ? DateTime.fromSQL(order.status_value.created_at) : DateTime.now();
                      const now = DateTime.now();
                      const daysInStatus = Math.ceil(now.diff(statusDate, ["days"]).toObject().days);
                      
                      return (
                        <div 
                          key={order.id}
                          className="bg-white rounded p-1.5 shadow-sm border cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => handleOrderClick(order)}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 mb-1">
                                {/* Working Status Indicator */}
                                <div className={`w-2 h-2 rounded-full ${modelInfo.working_status === "working" ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                
                                {/* Order ID */}
                                <span className="text-sm font-bold text-gray-800">#{order.id}</span>
                                
                                {/* Order Type Badge */}
                                {isCustom ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    Custom
                                  </span>
                                ) : isBulk ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                    B#{orderDetails.id}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                    O#{orderDetails?.id}
                                  </span>
                                )}
                                
                                {/* Days in Status */}
                                {daysInStatus > 2 && (
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${
                                    daysInStatus > 5 ? 'bg-red-100 text-red-800' : 
                                    daysInStatus > 3 ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    {daysInStatus}d
                                  </span>
                                )}
                              </div>
                              
                              {/* Order Description */}
                              <p className="text-xs text-gray-700 font-medium mb-0.5 truncate">{orderString}</p>
                              
                              {/* Customer Info */}
                              <div className="text-xs text-gray-600">
                                <span className="font-medium">Customer: </span>
                                <span className="truncate">
                                  {isCustom ? 
                                    (orderDetails.company || `${orderDetails.first_name} ${orderDetails.last_name}`) :
                                    (orderDetails?.company || `${orderDetails?.first_name} ${orderDetails?.last_name}`)
                                  }
                                </span>
                              </div>
                            </div>
                            
                            {/* Price and Payment Method */}
                            <div className="text-right ml-2 flex-shrink-0">
                              {/* Pricing */}
                              {!isCustom && order.value && (
                                <div className="mb-1">
                                  <div className="text-base font-bold text-green-600">${parseFloat(order.value).toFixed(2)}</div>
                                  {order.total && (
                                    <div className="text-base font-bold text-blue-600">${parseFloat(order.total).toFixed(2)}</div>
                                  )}
                                </div>
                              )}
                              {/* Payment Method */}
                              {(() => {
                                const paymentType = order.payment_type || order.order?.payment_type || order.bulk_order?.payment_type || order.custom?.payment_type;
                                const displayPaymentType = getPaymentType(paymentType);
                                return displayPaymentType && (
                                  <div>
                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold border ${displayPaymentType.color}`}>
                                      <span className="text-xs">{displayPaymentType.icon}</span>
                                      {displayPaymentType.name}
                                    </span>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      {/* Vertical Sidebar */}
      <div className="fixed right-0 top-0 bottom-0 w-20 bg-gray-800 bg-opacity-95 backdrop-blur-sm flex flex-col justify-between p-2 text-white z-40">
        <div className="space-y-2">
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
            <span className="text-xs font-semibold">LIVE</span>
          </div>
          
          {/* Navigation */}
          <div className="py-4 border-t border-b border-gray-600">
            <Link 
              to="/" 
              className="block p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded transition-colors"
              title="Dashboard View"
              onClick={() => setIsNavigating(true)}
            >
              {isNavigating ? (
                <svg className="w-4 h-4 mx-auto animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              )}
            </Link>
            <div className="p-2 text-white bg-gray-700 rounded mt-1" title="List View (Current)">
              <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </div>
          </div>
          
          <div className="text-xs space-y-2 text-center">
            <div>
              <div className="text-gray-300 text-xs">Updated</div>
              <div className="font-semibold text-xs">{formatTime(lastUpdated)}</div>
            </div>
            
            <div>
              <div className="text-gray-300 text-xs">Total</div>
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
            className="text-xs text-gray-400 hover:text-white transition-colors"
            title="Logout"
          >
            ⚠
          </button>
        </div>
      </div>

      {/* Modal - Full detailed version */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={closeModal}>
          <div className="bg-white rounded-lg p-6 max-w-4xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold mb-3">Order Overview</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Customer Name */}
                    <div>
                      <span className="text-sm text-gray-600">Customer</span>
                      <div className="font-semibold">
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
                        <span className="text-sm text-gray-600">Quote Value</span>
                        <div className="font-bold text-green-600">
                          ${parseFloat(selectedOrder.value).toFixed(2)}
                        </div>
                      </div>
                    )}
                    
                    {!selectedOrder.custom && selectedOrder.total && (
                      <div>
                        <span className="text-sm text-gray-600">Total</span>
                        <div className="font-bold text-blue-600">
                          ${parseFloat(selectedOrder.total).toFixed(2)}
                        </div>
                      </div>
                    )}
                    
                    {!selectedOrder.custom && (selectedOrder.discount_amount || selectedOrder.discount) && (
                      <div>
                        <span className="text-sm text-gray-600">Discount</span>
                        <div className="font-semibold text-red-600">
                          -${parseFloat(selectedOrder.discount_amount || selectedOrder.discount).toFixed(2)}
                        </div>
                      </div>
                    )}
                    
                    {!selectedOrder.custom && selectedOrder.tax_amount && (
                      <div>
                        <span className="text-sm text-gray-600">Tax</span>
                        <div className="font-semibold text-gray-800">
                          ${parseFloat(selectedOrder.tax_amount).toFixed(2)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Product Details */}
                <div className="bg-white border rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-3">Product Details</h3>
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
                {selectedOrder.notes && selectedOrder.notes.length > 0 && (
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
                <div className={`p-4 rounded-lg ${selectedOrderGroup.type === 'itad' ? 'bg-teal-100 border border-teal-200' : selectedOrderGroup.type === 'bulk' ? 'bg-purple-100 border border-purple-200' : 'bg-blue-100 border border-blue-200'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${selectedOrderGroup.type === 'itad' ? 'bg-teal-500' : selectedOrderGroup.type === 'bulk' ? 'bg-purple-500' : 'bg-blue-500'}`}></div>
                      <div className="font-bold text-lg">
                        {selectedOrderGroup.type === 'itad'
                          ? `ITAD Lot ${selectedOrderGroup.orders[0]?.itad_lot?.arc_pu || `#${selectedOrderGroup.itad_lot_id}`}`
                          : `${selectedOrderGroup.type === 'bulk' ? 'Bulk' : 'Custom'} Order #${selectedOrderGroup.order_id}`}
                      </div>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-sm font-medium ${
                        selectedOrderGroup.type === 'itad' ? 'bg-teal-200 text-teal-800' : selectedOrderGroup.type === 'bulk' ? 'bg-purple-200 text-purple-800' : 'bg-blue-200 text-blue-800'
                      }`}>
                        {selectedOrderGroup.orders.length} items
                      </span>
                    </div>
                    {selectedOrderGroup.type === 'bulk' && (() => {
                      const totalValue = selectedOrderGroup.orders.reduce((sum, order) => {
                        const value = parseFloat(order.total || order.value || 0);
                        return sum + value;
                      }, 0);
                      return totalValue > 0 && (
                        <div className="bg-white px-3 py-1.5 rounded-lg shadow-sm border">
                          <div className="text-lg font-bold text-green-600">
                            ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="text-sm text-gray-700">
                    <span className="font-medium">{selectedOrderGroup.type === 'itad' ? 'Lot: ' : 'Customer: '}</span>
                    {selectedOrderGroup.type === 'itad'
                      ? (selectedOrderGroup.orders[0]?.itad_lot?.arc_pu || `Lot #${selectedOrderGroup.itad_lot_id}`)
                      : (selectedOrderGroup.orders[0]?.[selectedOrderGroup.type === 'bulk' ? 'bulk_order' : 'custom']?.company ||
                     `${selectedOrderGroup.orders[0]?.[selectedOrderGroup.type === 'bulk' ? 'bulk_order' : 'custom']?.first_name} ${selectedOrderGroup.orders[0]?.[selectedOrderGroup.type === 'bulk' ? 'bulk_order' : 'custom']?.last_name}`)}
                  </div>
                </div>
                
                <div>
                  <h3 className="font-semibold mb-3 text-lg">Items in this group:</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedOrderGroup.orders.map((order) => {
                      const isCustom = selectedOrderGroup.type === 'custom';
                      const isBulk = selectedOrderGroup.type === 'bulk';
                      const isItad = selectedOrderGroup.type === 'itad';
                      const modelInfo = order.model_info ? JSON.parse(order.model_info) : { working_status: "working" };
                      const orderDetails = isItad ? order.itad_lot : isCustom ? order.custom : order.bulk_order;
                      const customerName = orderDetails?.company || `${orderDetails?.first_name} ${orderDetails?.last_name}`;
                      const statusDate = order.status_value.created_at ? DateTime.fromSQL(order.status_value.created_at) : DateTime.now();
                      const now = DateTime.now();
                      const daysInStatus = Math.ceil(now.diff(statusDate, ["days"]).toObject().days);
                      
                      return (
                        <div 
                          key={order.id}
                          className="bg-white rounded p-3 shadow-sm border cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => handleOrderClick(order)}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <div className={`w-2 h-2 rounded-full ${modelInfo.working_status === "working" ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                <span className="text-sm font-bold text-gray-800">{isItad ? `#${order.itad_lot?.arc_pu || order.itad_lot_id} - ${order.id}` : isCustom ? `#${order.order_id || order.custom?.id} - ${order.id}` : `#${order.id}`}</span>
                                {isItad ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
                                    ITAD
                                  </span>
                                ) : isCustom ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    Custom
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                    B#{orderDetails?.id}
                                  </span>
                                )}
                                {daysInStatus > 2 && (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                    daysInStatus > 5 ? 'bg-red-100 text-red-800' : 
                                    daysInStatus > 3 ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    {daysInStatus}d
                                  </span>
                                )}
                              </div>
                              
                              <p className="text-sm text-gray-700 font-medium mb-2">{order.model_desc}</p>
                              
                              <div className="text-xs text-gray-600 mb-2">
                                <span className="font-medium">Status: </span>
                                {order.status_value?.status_option?.name}
                              </div>
                              
                              <div className="text-xs text-gray-600">
                                <span className="font-medium">Customer: </span>
                                <span className="truncate">{customerName}</span>
                              </div>
                            </div>
                            
                            <div className="text-right ml-3 flex-shrink-0">
                              {(() => {
                                const paymentType = order.payment_type || orderDetails?.payment_type;
                                const displayPaymentType = getPaymentType(paymentType);
                                return displayPaymentType && (
                                  <div className="mb-2">
                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border ${displayPaymentType.color}`}>
                                      <span className="text-xs">{displayPaymentType.icon}</span>
                                      {displayPaymentType.name}
                                    </span>
                                  </div>
                                );
                              })()}
                              {!isCustom && order.value && (
                                <div>
                                  <div className="text-sm font-bold text-green-600">${parseFloat(order.value).toFixed(2)}</div>
                                  {order.total && (
                                    <div className="text-sm font-bold text-blue-600">${parseFloat(order.total).toFixed(2)}</div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
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