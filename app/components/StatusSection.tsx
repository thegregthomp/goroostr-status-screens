import React, { useEffect, useState, useRef } from "react";
import useResize from "hooks/useResize";
import { DateTime } from "luxon";
import { animated, useSpring } from "@react-spring/web";

export default function StatusSection({
  orders,
  statusKey,
  statusOptions,
  color = "",
  fullHeight,
  titleOverride,
  isCustom,
  orientation = null,
  onOrderClick,
  onGroupClick,
}: {
  section: String;
  color: String;
  fullHeight: Boolean;
  titleOverride: String;
  isCustom: Boolean;
  orientation: String;
  onOrderClick: Function;
  onGroupClick: Function;
}): React.ReactElement {
  const resize = useResize();
  const refContainer = useRef(null);
  const [isLargerThanContainer, setIsLargerThanContainer] = useState(false);
  const [animationConfig, setAnimationConfig] = useState({} as any);
  const [bulkOrders, setBulkOrders] = useState([]) as any;
  const [bulkOrdersSummary, setBulkOrdersSummary] = useState([]) as any;
  const [customOrders, setCustomOrders] = useState([]) as any;
  const [customOrdersSummary, setCustomOrdersSummary] = useState([]) as any;
  // ITAD assets are CustomOrderItems parented to an itad_lot (not a consumer
  // custom order), so they group by itad_lot_id and label by the lot's arc_pu.
  const [itadOrders, setItadOrders] = useState([]) as any;
  const [itadOrdersSummary, setItadOrdersSummary] = useState([]) as any;
  // const [styles, setStyles] = useState({});
  const dataRef = useRef(null);
  const animationConfigRef = useRef({});
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const userScrollTimeoutRef = useRef(null);
  const scrollContainerRef = useRef(null);

  const [styles, api] = useSpring(
    () => ({
      y: 0,
    }),
    []
  );

  const groupBulkOrders = (orders) => {
    const groupedOrders = [];
    const bulkOrders = orders.filter((order) => {
      return order.bulk_order != null;
    });

    //group bulk orders by order_id
    bulkOrders.forEach((order) => {
      const index = groupedOrders.findIndex(
        (groupedOrder) => groupedOrder.order_id == order.order_id
      );
      if (index == -1) {
        groupedOrders.push({
          order_id: order.order_id,
          orders: [order],
        });
      } else {
        groupedOrders[index].orders.push(order);
      }
    });

    // filter for status key
    groupedOrders.forEach((groupedOrder) => {
      const filteredOrders = groupedOrder.orders.filter((order) => {
        return order.status_value.status_option.key == statusKey;
      });
      groupedOrder.orders = filteredOrders;
    });

    //remove empty groups
    const filteredGroupedOrders = groupedOrders.filter((groupedOrder) => {
      return groupedOrder.orders.length > 0;
    });

    setBulkOrders(filteredGroupedOrders);
    const bulkOrderSummaries = [];
    filteredGroupedOrders.forEach((groupedOrder) => {
      //count total bulkOrders with order_id equal to groupedOrder.order_id
      const totalBulkOrders = bulkOrders.filter((order) => {
        return order.order_id == groupedOrder.order_id;
      });

      const orderSummary = {
        order_id: groupedOrder.order_id,
        order: groupedOrder.orders[0].bulk_order,
        count: `${groupedOrder.orders.length}/${totalBulkOrders.length}`,
      };

      bulkOrderSummaries.push(orderSummary);
    });
    setBulkOrdersSummary(bulkOrderSummaries);
  };

  const groupCustomOrders = (orders) => {
    const groupedOrders = [];
    const customOrders = orders.filter((order) => {
      return order.custom != null;
    });

    //group custom orders by order_id
    customOrders.forEach((order) => {
      const index = groupedOrders.findIndex(
        (groupedOrder) => groupedOrder.order_id == order.order_id
      );
      if (index == -1) {
        groupedOrders.push({
          order_id: order.order_id,
          orders: [order],
        });
      } else {
        groupedOrders[index].orders.push(order);
      }
    });

    // filter for status key
    groupedOrders.forEach((groupedOrder) => {
      const filteredOrders = groupedOrder.orders.filter((order) => {
        return order.status_value.status_option.key == statusKey;
      });
      groupedOrder.orders = filteredOrders;
    });

    //remove empty groups
    const filteredGroupedOrders = groupedOrders.filter((groupedOrder) => {
      return groupedOrder.orders.length > 0;
    });

    setCustomOrders(filteredGroupedOrders);
    const customOrderSummaries = [];
    filteredGroupedOrders.forEach((groupedOrder) => {
      //count total customOrders with order_id equal to groupedOrder.order_id
      const totalCustomOrders = customOrders.filter((order) => {
        return order.order_id == groupedOrder.order_id;
      });

      const orderSummary = {
        order_id: groupedOrder.order_id,
        order: groupedOrder.orders[0].custom,
        count: `${groupedOrder.orders.length}/${totalCustomOrders.length}`,
      };

      customOrderSummaries.push(orderSummary);
    });
    setCustomOrdersSummary(customOrderSummaries);
  };

  const groupItadOrders = (orders) => {
    const groupedOrders = [];
    const itadItems = orders.filter((order) => {
      return order.itad_lot_id != null;
    });

    // group ITAD assets by their lot
    itadItems.forEach((order) => {
      const index = groupedOrders.findIndex(
        (groupedOrder) => groupedOrder.itad_lot_id == order.itad_lot_id
      );
      if (index == -1) {
        groupedOrders.push({
          itad_lot_id: order.itad_lot_id,
          orders: [order],
        });
      } else {
        groupedOrders[index].orders.push(order);
      }
    });

    // filter for status key
    groupedOrders.forEach((groupedOrder) => {
      groupedOrder.orders = groupedOrder.orders.filter((order) => {
        return order.status_value.status_option.key == statusKey;
      });
    });

    const filteredGroupedOrders = groupedOrders.filter((groupedOrder) => {
      return groupedOrder.orders.length > 0;
    });

    setItadOrders(filteredGroupedOrders);
    const itadOrderSummaries = [];
    filteredGroupedOrders.forEach((groupedOrder) => {
      const totalItad = itadItems.filter((order) => {
        return order.itad_lot_id == groupedOrder.itad_lot_id;
      });
      itadOrderSummaries.push({
        itad_lot_id: groupedOrder.itad_lot_id,
        lot: groupedOrder.orders[0].itad_lot,
        count: `${groupedOrder.orders.length}/${totalItad.length}`,
      });
    });
    setItadOrdersSummary(itadOrderSummaries);
  };

  useEffect(() => {
    if (orders.length > 0) {
      groupCustomOrders(orders);
    }
  }, [orders, statusKey]);

  useEffect(() => {
    if (orders.length > 0) {
      groupItadOrders(orders);
    }
  }, [orders, statusKey]);

  const shouldHideSingleBulkOrders = ["DL", "IR", "PY", "PN"];

  useEffect(() => {
    if (orders.length > 0) {
      groupBulkOrders(orders);
    }
  }, [orders, statusKey]);

  useEffect(() => {
    if (resize.length > 0) {
      const containerHeight = refContainer.current.offsetHeight - 45;
      const dataHeight = dataRef.current.clientHeight;
      setAnimationConfig({
        dataHeight,
        containerHeight,
      });
      if (dataHeight > containerHeight) {
        setIsLargerThanContainer(true);
      }
    }
  }, [resize]);

  useEffect(() => {
    if (refContainer.current && dataRef.current) {
      // Small delay to allow DOM to update after content changes
      setTimeout(() => {
        if (refContainer.current && dataRef.current) {
          const containerHeight = refContainer.current.offsetHeight - 45;
          const dataHeight = dataRef.current.clientHeight;


          const newConfig = {
            dataHeight,
            containerHeight,
          };
          setAnimationConfig(newConfig);
          animationConfigRef.current = newConfig;

          if (dataHeight > containerHeight) {
            setIsLargerThanContainer(true);
          } else {
            setIsLargerThanContainer(false);
          }
        }
      }, 100);
    }
  }, [orders, bulkOrdersSummary, customOrdersSummary]);

  // Handle user scroll events
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleUserScroll = () => {
      // User is actively scrolling - pause auto-scroll
      setIsUserScrolling(true);
      
      // Clear existing timeout
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
      }
      
      // Resume auto-scroll after 5 seconds of inactivity
      userScrollTimeoutRef.current = setTimeout(() => {
        setIsUserScrolling(false);
      }, 5000);
    };

    const handleWheel = (e) => {
      if (isLargerThanContainer) {
        e.preventDefault();
        const scrollAmount = e.deltaY;
        const currentTransform = styles.y.get();
        const { dataHeight, containerHeight } = animationConfigRef.current;
        const maxScroll = -(dataHeight - containerHeight + 25);
        
        // Calculate new position
        const newY = Math.max(maxScroll, Math.min(0, currentTransform - scrollAmount));
        
        // Apply immediate scroll
        api.start({
          y: newY,
          config: { duration: 100 }
        });
        
        handleUserScroll();
      }
    };

    scrollContainer.addEventListener('wheel', handleWheel, { passive: false });
    scrollContainer.addEventListener('touchstart', handleUserScroll);
    scrollContainer.addEventListener('touchmove', handleUserScroll);

    return () => {
      scrollContainer.removeEventListener('wheel', handleWheel);
      scrollContainer.removeEventListener('touchstart', handleUserScroll);
      scrollContainer.removeEventListener('touchmove', handleUserScroll);
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
      }
    };
  }, [api, styles.y, isLargerThanContainer]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isLargerThanContainer && !isUserScrolling) {
        const { dataHeight, containerHeight } = animationConfigRef.current;
        const scrollDistance = dataHeight - containerHeight;

        // Calculate dynamic duration: minimum 8s, scale with content
        // Formula: 8s base + extra time for longer content (capped at 20s max)
        const dynamicDuration = Math.min(20000, Math.max(8000, 8000 + (scrollDistance / 200) * 1000));

        api.start({
          config: {
            duration: dynamicDuration,
          },
          from: { y: 0 },
          to: { y: scrollDistance * -1 - 25 },
        });

        api.start({
          config: {
            duration: dynamicDuration,
          },
          delay: dynamicDuration + 5000, // Shorter pause between cycles
          from: { y: scrollDistance * -1 - 25 },
          to: { y: 0 },
        });
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [api, isLargerThanContainer, isUserScrolling]);

  const filteredOrders = orders
    .filter((order) => {
      return order.status_value.status_option.key == statusKey;
    })
    .sort((a, b) => {
      // Priority order: 1. Bulk orders, 2. Custom orders, 3. Regular orders
      const aIsBulk = a.bulk_order != null;
      const aIsCustom = a.custom != null;
      const bIsBulk = b.bulk_order != null;
      const bIsCustom = b.custom != null;

      if (aIsBulk && !bIsBulk && !bIsCustom) return -1; // Bulk orders first
      if (bIsBulk && !aIsBulk && !aIsCustom) return 1;

      if (aIsCustom && !bIsBulk && !bIsCustom) return -1; // Custom orders second
      if (bIsCustom && !aIsBulk && !aIsCustom) return 1;

      return 0; // Keep original order for same types
    });

  const isFullHeight = fullHeight ? "h-screen" : "";

  // Status icon mapping
  const getStatusIcon = (statusKey) => {
    switch (statusKey) {
      case 'OD': return '🚚'; // Truck for Out for Delivery
      case 'IP': return '⚡'; // Lightning for In Progress  
      case 'PN': return '📋'; // Clipboard for Print Next
      case 'DL': return '✅'; // Checkmark for Delivered
      case 'IR': return '🔄'; // Recycle for In Review
      case 'PY': return '💰'; // Money bag for Ready for Payment
      default: return '📦'; // Package as fallback
    }
  };

  return (
    <div
      className={`flex w-full flex-col ${color} ${isFullHeight}`}
      ref={refContainer}
    >
      {!titleOverride ? (
        <div className="header py-2 text-center flex items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-base font-bold bg-white text-gr-black rounded-lg shadow-sm border border-gr-black/10">
            <span className="text-sm">{getStatusIcon(statusKey)}</span>
            {statusOptions.find((option) => option.key == statusKey).name}
          </span>
          <span className="inline-block px-2 py-0.5 text-base font-bold bg-gr-green text-gr-black rounded-lg shadow-sm border border-gr-black/10">
            {filteredOrders.length}
          </span>
        </div>
      ) : (
        <div className="header py-2 text-center">
          <span className="inline-block px-2 py-0.5 text-base font-bold bg-gr-green text-gr-black rounded-lg shadow-sm border border-gr-black/10">
            {titleOverride}
          </span>
        </div>
      )}
      <div className="relative flex flex-1 flex-col overflow-hidden py-2 px-3" ref={scrollContainerRef}>
        <animated.div
          style={{
            ...styles,
          }}
        >
          <div className={isLargerThanContainer ? "marquee" : ""} ref={dataRef}>
            {shouldHideSingleBulkOrders.includes(statusKey) &&
              bulkOrdersSummary.map((orderSummary) => {
                // Partner trade-ins are bulk orders with type 'trade_in' — same
                // grouping, but render rose + the partner name to set them apart
                // from consumer bulk orders (purple).
                const isTradeIn = orderSummary.order && orderSummary.order.type === "trade_in";
                const partnerName = isTradeIn && orderSummary.order.partner ? orderSummary.order.partner.name : null;
                return (
                  <React.Fragment key={orderSummary.count}>
                    <div
                      className={`mb-1 flex justify-between rounded ${isTradeIn ? "bg-rose-100 hover:bg-rose-200" : "bg-purple-100 hover:bg-purple-200"} py-0.5 px-2 shadow-sm cursor-pointer transition-colors`}
                      onClick={() => onGroupClick(bulkOrders.find(group => group.order_id === orderSummary.order_id), 'Bulk')}
                    >
                      <div>
                        <span>
                          <span
                            className={`mr-1 inline-flex h-2 w-2 items-center rounded-full ${isTradeIn ? "bg-rose-500" : "bg-purple-500"} text-xs font-medium`}
                            style={{ marginBottom: "1px" }}
                          ></span>
                        </span>
                        <span
                          className={`inline-block text-sm font-bold text-black`}
                        >
                          {orderSummary.order_id}
                        </span>{" "}
                        &#x2022;{" "}
                        <span className="font-bold">
                          {partnerName ? (
                            <>{partnerName}</>
                          ) : orderSummary.order.company ? (
                            <>{orderSummary.order.company}</>
                          ) : (
                            <>
                              {orderSummary.order.first_name}{" "}
                              {orderSummary.order.last_name}
                            </>
                          )}
                        </span>
                      </div>
                      <span className={`inline-flex items-center whitespace-nowrap rounded-full ${isTradeIn ? "bg-rose-300" : "bg-purple-300"} px-2.5 py-0.5 text-xs font-medium text-black`}>
                        {orderSummary.count}
                      </span>
                    </div>
                  </React.Fragment>
                );
              })}
            {shouldHideSingleBulkOrders.includes(statusKey) &&
              customOrdersSummary.map((orderSummary) => {
                return (
                  <React.Fragment key={orderSummary.count}>
                    <div
                      className={`mb-1 flex justify-between rounded bg-blue-100 py-0.5 px-2 shadow-sm cursor-pointer hover:bg-blue-200 transition-colors`}
                      onClick={() => onGroupClick(customOrders.find(group => group.order_id === orderSummary.order_id), 'Custom')}
                    >
                      <div>
                        <span>
                          <span
                            className="mr-1 inline-flex h-2 w-2 items-center rounded-full bg-blue-500 text-xs font-medium"
                            style={{ marginBottom: "1px" }}
                          ></span>
                        </span>
                        <span
                          className={`inline-block text-sm font-bold text-black`}
                        >
                          {orderSummary.order_id}
                        </span>{" "}
                        &#x2022;{" "}
                        <span className="font-bold">
                          {orderSummary.order.company ? (
                            <>{orderSummary.order.company}</>
                          ) : (
                            <>
                              {orderSummary.order.first_name}{" "}
                              {orderSummary.order.last_name}
                            </>
                          )}
                        </span>
                      </div>
                      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-blue-300 px-2.5 py-0.5 text-xs font-medium text-black">
                        {orderSummary.count}
                      </span>
                    </div>
                  </React.Fragment>
                );
              })}
            {shouldHideSingleBulkOrders.includes(statusKey) &&
              itadOrdersSummary.map((orderSummary) => {
                return (
                  <React.Fragment key={`itad-${orderSummary.itad_lot_id}-${orderSummary.count}`}>
                    <div
                      className={`mb-1 flex justify-between rounded bg-teal-100 py-0.5 px-2 shadow-sm cursor-pointer hover:bg-teal-200 transition-colors`}
                      onClick={() => onGroupClick(itadOrders.find(group => group.itad_lot_id === orderSummary.itad_lot_id), 'ITAD')}
                    >
                      <div>
                        <span>
                          <span
                            className="mr-1 inline-flex h-2 w-2 items-center rounded-full bg-teal-500 text-xs font-medium"
                            style={{ marginBottom: "1px" }}
                          ></span>
                        </span>
                        <span className={`inline-block text-sm font-bold text-black`}>
                          {orderSummary.lot ? orderSummary.lot.arc_pu : `Lot #${orderSummary.itad_lot_id}`}
                        </span>{" "}
                        &#x2022;{" "}
                        <span className="font-bold">ITAD</span>
                      </div>
                      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-teal-300 px-2.5 py-0.5 text-xs font-medium text-black">
                        {orderSummary.count}
                      </span>
                    </div>
                  </React.Fragment>
                );
              })}
            <>
              {filteredOrders.map((order) => {
                if (
                  shouldHideSingleBulkOrders.includes(statusKey) &&
                  (order.bulk_order != null || order.custom != null || order.itad_lot_id != null)
                ) {
                  return null;
                }

                // Order/item type detection
                const isItad = order.itad_lot_id != null;
                const isCustom = order.custom != null;
                const isBulk = order.bulk_order != null;
                const isTradeIn = isBulk && order.bulk_order.type === "trade_in";

                let modelInfo, details, orderDetails;

                if (isCustom || isItad) {
                  // Custom + ITAD items may not have model_info/details in the
                  // same format; the API back-fills them as a small JSON blob.
                  modelInfo = order.model_info
                    ? JSON.parse(order.model_info)
                    : { working_status: "working" };
                  details = order.details ? JSON.parse(order.details) : {};
                  orderDetails = isItad ? order.itad_lot : order.custom;
                } else {
                  // Guard: some regular orders carry a null model_info/details,
                  // which would make JSON.parse(null) return null and crash on
                  // modelInfo.working_status below.
                  modelInfo = order.model_info ? JSON.parse(order.model_info) : { working_status: "working" };
                  details = order.details ? JSON.parse(order.details) : {};
                  orderDetails = order.order;
                  if (isBulk) {
                    orderDetails = order.bulk_order;
                  }
                }
                const statusDate = DateTime.fromSQL(
                  order.status_value.created_at
                );
                const now = DateTime.now();
                const diff = Math.ceil(
                  now.diff(statusDate, ["days"]).toObject().days
                );
                let background = "bg-white";
                let orderIdColor = "text-black";
                // switch (diff) {
                //   case 0:
                //     background = "bg-white";
                //     break;
                //   case 1:
                //     background = "bg-white";
                //     break;
                //   case 2:
                //     background = "bg-yellow-100";
                //     orderIdColor = "text-yellow-800";
                //     break;
                //   case 3:
                //     background = "bg-orange-100";
                //     orderIdColor = "text-orange-800";
                //     break;
                //   default:
                //     background = "bg-red-100";
                //     orderIdColor = "text-red-800";
                //     break;
                // }
                let orderString;
                if (isCustom) {
                  // For custom orders, show company or name
                  orderString = orderDetails.company
                    ? orderDetails.company
                    : `${orderDetails.first_name} ${orderDetails.last_name}`;
                } else {
                  orderString = order.model_desc || order.description || "";
                  if (orderString.length > 50) {
                    orderString = orderString.substr(0, 50) + "\u2026";
                  }
                }
                return (
                  <React.Fragment key={order.id}>
                    {order.status_value.status_option.key == statusKey && (
                      <div
                        className={`${background} mb-1 flex justify-between rounded py-0.5 px-2 shadow-sm cursor-pointer hover:bg-gray-100 transition-colors`}
                        onClick={() => onOrderClick(order)}
                      >
                        <div>
                          <span>
                            {modelInfo.working_status == "working" ? (
                              <span
                                className="mr-1 inline-flex h-2 w-2 items-center rounded-full bg-gr-green-dark text-xs font-medium"
                                style={{ marginBottom: "1px" }}
                              ></span>
                            ) : (
                              <span
                                className="mr-1 inline-flex h-2 w-2 items-center rounded-full bg-red-800 text-xs font-medium"
                                style={{ marginBottom: "1px" }}
                              ></span>
                            )}
                          </span>
                          <span
                            className={`${orderIdColor} inline-block text-sm font-bold tracking-wide`}
                          >
                            {isCustom
                              ? `${order.order_id || order.custom?.id} - ${order.id}`
                              : isItad
                              ? `${order.itad_lot?.arc_pu || `Lot ${order.itad_lot_id}`} - ${order.id}`
                              : order.id}
                          </span>{" "}
                          &#x2022;{" "}
                          <span className="text-sm font-medium">{orderString}</span>
                          <br />
                        </div>
                        <span>
                          {isItad ? (
                            <span className="inline-flex items-center whitespace-nowrap rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-800">
                              ITAD
                            </span>
                          ) : isCustom ? (
                            <span className="inline-flex items-center whitespace-nowrap rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                              Custom
                            </span>
                          ) : isTradeIn ? (
                            <span className="inline-flex items-center whitespace-nowrap rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-800">
                              {orderDetails.id}
                            </span>
                          ) : isBulk ? (
                            <span className="inline-flex items-center whitespace-nowrap rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">
                              {orderDetails.id}
                            </span>
                          ) : (
                            <span className="inline-flex items-center whitespace-nowrap rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-800">
                              {orderDetails?.id}
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </>
          </div>
        </animated.div>
      </div>
    </div>
  );
}
