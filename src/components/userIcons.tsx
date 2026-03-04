

import React from 'react';
import { appUsers, vendors } from '../lib/consts';

interface VendorIconProps extends React.SVGProps<SVGSVGElement> {
  vendorId: string;
  color: string;
}

const VendorIconBase: React.FC<VendorIconProps> = ({ vendorId, color, ...props }) => {
  const renderText = () => {
    if (vendorId.length === 1) {
      return (
        <text
          x="904"
          y="1050" // Adjusted for vertical centering
          dominantBaseline="middle"
          textAnchor="middle"
          style={{ fontFamily: '"Ebrima-Bold", "Ebrima"', fontWeight: 700, fontSize: '1100px', letterSpacing: "-100px" }}
          fill="var(--text-color)"
          fillOpacity="0.5"
        >
          {vendorId}
        </text>
      );
    }
    if (vendorId.length === 2) {
      return (
        <>
          <g transform="matrix(0.878961, 0.476894, -0.476894, 0.878961, 649.953, -255.815)" style={{fontFamily:'"Ebrima-Bold", "Ebrima"', fontWeight:700, fontSize:'647.349px'}} fill="var(--text-color)" fillOpacity="0.5">
            <text x="-103.102" y="1941.1">{vendorId[0]}</text>
          </g>
          <g transform="matrix(0.877743, -0.479132, 0.479132, 0.877743, -315.721, 1326.22)" style={{fontFamily:'"Ebrima-Bold", "Ebrima"', fontWeight:700, fontSize:'648.247px'}} fill="var(--text-color)" fillOpacity="0.5">
            <text x="745.011" y="853.282">{vendorId[1]}</text>
          </g>
        </>
      );
    }
    return null;
  };

  return (
    <svg width="100%" height="100%" viewBox="0 0 1808 2096" {...props}>
      <path d="M-0,1609.06l900.137,486.336l907.485,-496.323l-900.137,-486.336l-907.485,496.323Z" fill="var(--secondary-color)" fillOpacity="0.3"/>
      <path d="M890.8,887.045l0,903.041l-797.05,-435.924l-0,-903.041l797.05,435.924Z" fill={color} fillOpacity="0.5"/>
      <path d="M890.8,878.436l0,925.882l823.072,-450.156l0,-925.881l-823.072,450.155Z" fill="currentColor" fillOpacity="0.75"/>
      <path d="M81.042,441.337l812.569,439.024l806.948,-441.337l-812.569,-439.024l-806.948,441.337Z" fill="currentColor" fillOpacity="0.5"/>
      <path d="M215.715,439.546l668.333,361.094l679.915,-371.86l-668.333,-361.094l-679.915,371.86Z" fill={color} fillOpacity="0.5"/>
      <g opacity="0.5">
        {renderText()}
      </g>
    </svg>
  );
};

const userIcons: { [key: string]: React.FC<React.SVGProps<SVGSVGElement>> } = {};
Object.keys(appUsers).forEach(id => {
  const color = vendors[id as keyof typeof vendors]?.color || '#888888';
  userIcons[id] = (props) => <VendorIconBase vendorId={id} color={color} {...props} />;
});

export default userIcons;
