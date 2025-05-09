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
}: {
  section: String;
  color: String;
  fullHeight: Boolean;
  titleOverride: String;
  isCustom: Boolean;
  orientation: String;
}): React.ReactElement {
  const resize = useResize();
  const refContainer = useRef(null);
  const [isLargerThanContainer, setIsLargerThanContainer] = useState(false);
  const [animationConfig, setAnimationConfig] = useState({} as any);
  const [bulkOrders, setBulkOrders] = useState([]) as any;
  const [bulkOrdersSummary, setBulkOrdersSummary] = useState([]) as any;
  const [customOrders, setCustomOrders] = useState([]) as any;
  // const [styles, setStyles] = useState({});
  const dataRef = useRef(null);

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
          company: order.custom.company,
          first_name: order.custom.first_name,
          last_name: order.custom.last_name,
        });
      } else {
        groupedOrders[index].orders.push(order);
      }
    });

    setCustomOrders(groupedOrders);
    // console.log("custom orders", customOrders);
  };

  useEffect(() => {
    if (orders.length > 0) {
      groupCustomOrders(orders);
    }
  }, [orders]);

  const shouldHideSingleBulkOrders = ["DL", "IR", "AW", "PN"];

  useEffect(() => {
    if (orders.length > 0) {
      groupBulkOrders(orders);
    }
  }, [orders]);

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
    const containerHeight = refContainer.current.offsetHeight - 45;
    const dataHeight = dataRef.current.clientHeight;
    setAnimationConfig({
      dataHeight,
      containerHeight,
    });

    if (dataHeight > containerHeight) {
      setIsLargerThanContainer(true);
    } else {
      setIsLargerThanContainer(false);
    }
  }, [orders]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isLargerThanContainer) {
        const { dataHeight, containerHeight } = animationConfig;
        api.start({
          config: {
            duration: 10000,
          },
          from: { y: 0 },
          to: { y: (dataHeight - containerHeight) * -1 - 25 },
        });

        api.start({
          config: {
            duration: 10000,
          },
          delay: 20000,
          from: { y: (dataHeight - containerHeight) * -1 - 25 },
          to: { y: 0 },
        });
      }
    }, 35000);
    return () => clearInterval(interval);
  }, [api, isLargerThanContainer]);

  const filteredOrders = orders.filter((order) => {
    return order.status_value.status_option.key == statusKey;
  });

  const isFullHeight = fullHeight ? "h-screen" : "";

  return (
    <div
      className={`flex w-full flex-col ${color} ${isFullHeight}`}
      ref={refContainer}
    >
      {!titleOverride ? (
        <div className="header py-2 text-center text-lg font-bold">
          {statusOptions.find((option) => option.key == statusKey).name} (
          {filteredOrders.length})
        </div>
      ) : (
        <div className="header py-2 text-center text-lg font-bold">
          {titleOverride}
        </div>
      )}
      <div className="relative flex flex-1 flex-col overflow-hidden py-2 px-3">
        <animated.div
          style={{
            ...styles,
          }}
        >
          {!isCustom ? (
            <div
              className={isLargerThanContainer ? "marquee" : ""}
              ref={dataRef}
            >
              {shouldHideSingleBulkOrders.includes(statusKey) &&
                bulkOrdersSummary.map((orderSummary) => {
                  return (
                    <React.Fragment key={orderSummary.count}>
                      <div
                        className={`mb-1 flex justify-between rounded bg-purple-100 py-0.5 px-2 shadow-sm`}
                      >
                        <div>
                          <span>
                            <span
                              className="mr-1 inline-flex h-2 w-2 items-center rounded-full bg-purple-500 text-xs font-medium"
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
                        <span className="inline-flex items-center whitespace-nowrap rounded-full bg-purple-300 px-2.5 py-0.5 text-xs font-medium text-black">
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
                    order.bulk_order != null
                  ) {
                    return null;
                  }
                  const modelInfo = JSON.parse(order.model_info);
                  const details = JSON.parse(order.details);
                  const isBulk = order.bulk_order != null;
                  let orderDetails = order.order;
                  if (isBulk) {
                    orderDetails = order.bulk_order;
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
                  let orderString = order.model_desc;
                  if (orderString.length > 50) {
                    orderString = order.model_desc.substr(0, 50) + "\u2026";
                  }
                  return (
                    <React.Fragment key={order.id}>
                      {order.status_value.status_option.key == statusKey && (
                        <div
                          className={`${background} mb-1 flex justify-between rounded py-0.5 px-2 shadow-sm`}
                        >
                          <div>
                            <span>
                              {modelInfo.working_status == "working" ? (
                                <span
                                  className="mr-1 inline-flex h-2 w-2 items-center rounded-full bg-emerald-800 text-xs font-medium"
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
                              className={`${orderIdColor} inline-block text-sm font-bold`}
                            >
                              {order.id}
                            </span>{" "}
                            &#x2022;{" "}
                            <span className="text-sm">{orderString}</span>
                            <br />
                          </div>
                          <span>
                            {isBulk ? (
                              <span className="inline-flex items-center whitespace-nowrap rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">
                                {/* {orderDetails.company ? (
                                <>{orderDetails.company}</>
                              ) : (
                                <>
                                  {orderDetails.first_name}{" "}
                                  {orderDetails.last_name}
                                </>
                              )} */}
                                {orderDetails.id}
                              </span>
                            ) : (
                              <span className="inline-flex items-center whitespace-nowrap rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-800">
                                {/* {orderDetails.first_name} {orderDetails.last_name} */}
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
          ) : (
            <div
              className={isLargerThanContainer ? "marquee" : ""}
              ref={dataRef}
            >
              {customOrders.map((order) => {
                return (
                  <React.Fragment key={order.id}>
                    <div
                      className={`mb-1 flex justify-between rounded bg-white py-0.5 px-2 shadow-sm`}
                    >
                      <div>
                        <span
                          className={`$text-black inline-block text-sm font-bold`}
                        >
                          {order.order_id}
                        </span>{" "}
                        &#x2022;{" "}
                        <span className="text-sm">
                          {order.company ? (
                            <>{order.company}</>
                          ) : (
                            <>
                              {order.first_name} {order.last_name}
                            </>
                          )}{" "}
                          <span className="text-xs font-bold text-gray-400"></span>
                        </span>
                        <br />
                      </div>
                      <span>
                        <span
                          className={`inline-flex items-center whitespace-nowrap rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800`}
                        >
                          {order.orders.length}
                        </span>
                      </span>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </animated.div>
      </div>
    </div>
  );
}
