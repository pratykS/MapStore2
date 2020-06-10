import React from "react";
import Map from "../../../components/map/leaflet/Map";

class TimezoneComponent extends React.Component {
    render() {
        const style = {
            position: "absolute",
            top: "100px",
            left: "100px",
            zIndex: 10000000,
        };
        return <div style={style}>Timezone</div>;
    }
}

export const TimezonePlugin = TimezoneComponent;
