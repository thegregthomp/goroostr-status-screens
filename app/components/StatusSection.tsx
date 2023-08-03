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
}: {
  section: String;
  color: String;
  fullHeight: Boolean;
  titleOverride: String;
  isCustom: Boolean;
}): React.ReactElement {
  const resize = useResize();
  const refContainer = useRef(null);
  const [isLargerThanContainer, setIsLargerThanContainer] = useState(false);
  const [animationConfig, setAnimationConfig] = useState({} as any);
  // const [styles, setStyles] = useState({});
  const dataRef = useRef(null);

  const [styles, api] = useSpring(
    () => ({
      y: 0,
    }),
    []
  );

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
              {filteredOrders.map((order) => {
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
                switch (diff) {
                  case 0:
                    background = "bg-white";
                    break;
                  case 1:
                    background = "bg-white";
                    break;
                  case 2:
                    background = "bg-yellow-100";
                    orderIdColor = "text-yellow-800";
                    break;
                  case 3:
                    background = "bg-orange-100";
                    orderIdColor = "text-orange-800";
                    break;
                  default:
                    background = "bg-red-100";
                    orderIdColor = "text-red-800";
                    break;
                }
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
                              {orderDetails.id}
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          ) : (
            <div
              className={isLargerThanContainer ? "marquee" : ""}
              ref={dataRef}
            >
              {orders.map((order) => {
                console.log(order);
                return (
                  <React.Fragment key={order.id}>
                    <div
                      className={`mb-1 flex justify-between rounded bg-white py-0.5 px-2 shadow-sm`}
                    >
                      <div>
                        <span
                          className={`$text-black inline-block text-sm font-bold`}
                        >
                          {order.order_id}-{order.id}
                        </span>{" "}
                        &#x2022;{" "}
                        <span className="text-sm">
                          {order.description}{" "}
                          <span className="text-xs font-bold text-gray-400">
                            ({order.status_value.status_option.key})
                          </span>
                        </span>
                        <br />
                      </div>
                      <span>
                        <span className="inline-flex items-center whitespace-nowrap rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                          {order.custom.company ? (
                            <>{order.custom.company}</>
                          ) : (
                            <>
                              {order.custom.first_name} {order.custom.last_name}
                            </>
                          )}
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
