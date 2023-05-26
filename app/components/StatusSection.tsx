import React, { useEffect, useState, useRef } from "react";
import useResize from "hooks/useResize";
import {DateTime} from "luxon";
import { animated, useSpring } from '@react-spring/web'

export default function StatusSection({orders, statusKey, statusOptions, color=''}: {section: String, color: String}): React.ReactElement {
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
  )
  
  useEffect(() => {
    if(resize.length > 0){
      console.log(resize[0]/2 );
      const containerHeight = refContainer.current.offsetHeight - 45;
      const dataHeight = dataRef.current.clientHeight;
      setAnimationConfig({
        dataHeight,
        containerHeight,
      });
      if(dataHeight > containerHeight){
        setIsLargerThanContainer(true);
        // console.log(dataHeight, containerHeight);
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
      
    if(dataHeight > containerHeight){
      setIsLargerThanContainer(true);
    } else{
      setIsLargerThanContainer(false);
    }
  }, [orders]);

  useEffect(() => {
    const interval = setInterval(() => {
      console.log('interval');
      if(isLargerThanContainer){
        const {dataHeight, containerHeight} = animationConfig;
        console.log(dataHeight, containerHeight)
        api.start({
          config: {
            duration: 10000
          },
          from: { y: 0 },
          to: { y: ((dataHeight-containerHeight)*-1)-25},
        })

        api.start({
          config: {
            duration: 10000
          },
          delay: 20000,
          from: { y: ((dataHeight-containerHeight)*-1)-25 },
          to: { y: 0 },
        })
      }
    }, 35000);  
    return () => clearInterval(interval);
  }, [api, isLargerThanContainer]);

  
  const filteredOrders = orders.filter((order) => {
    return order.status_value.status_option.key == statusKey;
  });

  return (
    <div className={`w-full flex flex-col ${color}`} ref={refContainer}>
      <div className="text-center text-lg py-2 font-bold header">{statusOptions.find((option)=>option.key == statusKey).name} ({filteredOrders.length})</div>
      <div className="flex flex-col py-2 px-3 flex-1 overflow-hidden relative">
      <animated.div
      style={{
        ...styles
      }}
      
      >
        <div className={isLargerThanContainer ? 'marquee' : ''} ref={dataRef}>
          {filteredOrders.map((order)=> {
            
            const modelInfo = JSON.parse(order.quote[0].model_info);
            const details = JSON.parse(order.quote[0].details);
            const statusDate = DateTime.fromSQL(order.status_value.created_at);
            const now = DateTime.now();
            const diff = Math.ceil(now.diff(statusDate, ['days']).toObject().days);
            let background = 'bg-white';
            let orderIdColor = 'text-black';
            switch(diff){
              case 0:
                background = 'bg-white';
                break;
              case 1:
                background = 'bg-white';
                break;
              case 2:
                background = 'bg-yellow-100';
                orderIdColor = 'text-yellow-800';
                break;
              case 3:
                background = 'bg-orange-100';
                orderIdColor = 'text-orange-800';
                break
              default:
                background = 'bg-red-100';
                orderIdColor = 'text-red-800';
                break;

            }
            return (
            <React.Fragment key={order.id}>
              {order.status_value.status_option.key == statusKey && (
                <div className={`${background} py-1 px-2 rounded shadow-sm mb-1 flex justify-between`}>
                  <div>
                  <span className={`${orderIdColor} font-bold inline-block mr-1`}>{order.id}</span> &#x2022; <span>{order.quote[0].model_desc}</span>
                  </div>
                  <span>
                    {modelInfo.working_status == 'working' ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">Working</span>
                    ):(
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">Broken</span>
                    )}
                  </span>
                  
                </div>
    

              )}
            </React.Fragment>
          )})}
          </div> 
          </animated.div>
      </div>
    
    </div>
  );
}


