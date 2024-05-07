import React, { useState, useCallback, useEffect } from "react";
import type { LoaderArgs } from "@remix-run/node";
import StatusSection from "~/components/StatusSection";
import { useOptionalUser } from "~/utils";
import { useLoaderData } from "@remix-run/react";
import { json } from "@remix-run/node";
import stylesheetUrl from "../styles/global.css";
import { getOrders } from "~/models/orders.server";
import Pusher from "pusher-js";
import sortBy from "lodash/sortBy";
import indexOf from "lodash/indexOf";
import { useInterval } from "usehooks-ts";
import { set } from "cypress/types/lodash";
import useResizeObserver from "use-resize-observer";

export function links() {
  // `links` returns an array of objects whose
  // properties map to the `<link />` component props
  return [{ rel: "stylesheet", href: stylesheetUrl }];
}

export async function loader({ request }: LoaderArgs) {
  return json(await getOrders());
}

export default function Index() {
  const { data, custom, status_options } = useLoaderData();
  const [orders, setOrders] = useState(data);
  const [customOrders, setCustomOrders] = useState(custom);
  const [channel, setChannel] = useState(null);
  const [shouldReset, setShouldReset] = useState(true);
  const [pusher, setPusher] = useState(null);
  const [orientation, setOrientation] = useState("portrait");

  const { ref, width = 1, height = 1 } = useResizeObserver<HTMLDivElement>();
  useEffect(() => {
    if (window && window.matchMedia("(orientation: portrait)").matches) {
      setOrientation("portrait");
    } else {
      setOrientation("landscape");
    }
  }, [width, height]);

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
      });
      pusher.connection.bind("error", function (error) {
        console.error("connection error", error);
      });
      pusher.connection.bind("state_change", function (states) {
        console.log("Pusher state change", states);
      });
      pusher.connection.bind("disconnected", function () {
        console.log("Pusher Disconnected");
      });
      pusher.connection.bind("failed", function () {
        console.log("Pusher failed");
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
    const response = await fetch(
      `http://goroostr-api.test/api/get-status-orders`
    );
    const { data, custom } = await response.json();
    setOrders(data);
    setCustomOrders(custom);
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

        return sorted;
      });
    });
  }, [channel, sortAndOrder, status_options]);

  if (!channel) return null;

  return (
    <main
      className="relative min-h-screen bg-white sm:flex sm:items-center sm:justify-center"
      ref={ref}
    >
      {orientation === "landscape" ? (
        <>
          <div
            className={`grid-container main-grid grid ${
              custom.length > 1 ? "w-3/4" : "w-full"
            } grid-cols-3 gap-0`}
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
          <div className={`h-screen ${custom.length > 1 ? "w-1/4" : "hidden"}`}>
            <StatusSection
              color="bg-sky-100"
              fullHeight={true}
              orders={custom}
              isCustom
              titleOverride={"Custom Orders"}
              statusOptions={status_options}
            />
          </div>
        </>
      ) : (
        <>
          <div
            className={`grid-container main-grid grid ${
              custom.length > 1 ? "w-3/4" : "w-full"
            } grid-cols-2 gap-0`}
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
          <div className={`h-screen ${custom.length > 1 ? "w-1/4" : "hidden"}`}>
            <StatusSection
              color="bg-sky-100"
              fullHeight={true}
              orders={custom}
              isCustom
              titleOverride={"Custom Orders"}
              statusOptions={status_options}
            />
          </div>
        </>
      )}
    </main>
  );
}
