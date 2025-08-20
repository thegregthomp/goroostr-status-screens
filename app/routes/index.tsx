import React, { useState, useCallback, useEffect } from "react";
import type { LoaderArgs } from "@remix-run/node";
import StatusSection from "~/components/StatusSection";
import { useLoaderData } from "@remix-run/react";
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

  const { ref, width = 1, height = 1 } = useResizeObserver<HTMLDivElement>();
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
        `${apiEndpoint}/get-status-orders`
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
            <StatusSection
              color="bg-emerald-50"
              orders={orders}
              statusKey={"OD"}
              statusOptions={status_options}
            />
            <StatusSection
              color="bg-emerald-200"
              orders={orders}
              statusKey={"IP"}
              statusOptions={status_options}
            />
            <StatusSection
              color="bg-emerald-400"
              orders={orders}
              statusKey={"PN"}
              statusOptions={status_options}
            />
            <StatusSection
              color="bg-emerald-100"
              orders={orders}
              statusKey={"DL"}
              statusOptions={status_options}
            />
            <StatusSection
              color="bg-emerald-300"
              orders={orders}
              statusKey={"IR"}
              statusOptions={status_options}
            />
            <StatusSection
              color="bg-emerald-500"
              orders={orders}
              statusKey={"AW"}
              statusOptions={status_options}
            />
          </div>
        </>
      ) : (
        <>
          <div
            className="grid-container main-grid grid w-full grid-cols-2 gap-0"
          >
            <StatusSection
              color="bg-emerald-50"
              orders={orders}
              statusKey={"OD"}
              statusOptions={status_options}
            />
            <StatusSection
              color="bg-emerald-100"
              orders={orders}
              statusKey={"DL"}
              statusOptions={status_options}
            />
            <StatusSection
              color="bg-emerald-200"
              orders={orders}
              statusKey={"IP"}
              statusOptions={status_options}
            />
            <StatusSection
              color="bg-emerald-300"
              orders={orders}
              statusKey={"IR"}
              statusOptions={status_options}
            />
            <StatusSection
              color="bg-emerald-400"
              orders={orders}
              statusKey={"PN"}
              statusOptions={status_options}
            />
            <StatusSection
              color="bg-emerald-500"
              orders={orders}
              statusKey={"AW"}
              statusOptions={status_options}
            />
          </div>
        </>
      )}
      </div>
      
      {/* Vertical Sidebar */}
      <div className="w-20 bg-gray-800 bg-opacity-95 backdrop-blur-sm flex flex-col justify-between p-2 text-white">
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
        
        <div className="text-center">
          <div className="text-lg font-bold">
            {currentTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' AM', '').replace(' PM', '')}
          </div>
        </div>
      </div>
    </main>
  );
}
