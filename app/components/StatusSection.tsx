import React from "react";

export default function StatusSection({orders, statusKey, statusOptions, color=''}: {section: String, color: String}): React.ReactElement {
  
  return (
    <div className={`w-full flex flex-col ${color}`}>
      <div className="text-center text-lg py-2 font-bold">{statusOptions.find((option)=>option.key == statusKey).name}</div>
      <div className="flex flex-col py-2 px-3">
        {orders.map((order)=> {
          const modelInfo = JSON.parse(order.quote[0].model_info);
          const details = JSON.parse(order.quote[0].details);
          
          return (
          <React.Fragment key={order.id}>
            {order.status_value.status_option.key == statusKey && (
              <div className="bg-white py-1 px-2 rounded shadow-sm mb-1 flex justify-between">
                <div>
                <span className="font-bold inline-block mr-1">{order.id}</span> &#x2022; <span>{order.quote[0].model_desc}</span>
                </div>
                <span>
                  {modelInfo.working_status == 'working' ? (
                    <span class="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">Working</span>
                  ):(
                    <span class="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">Broken</span>
                  )}
                </span>
                
              </div>
  

            )}
          </React.Fragment>
        )})}

    </div>
    </div>
  );
}


