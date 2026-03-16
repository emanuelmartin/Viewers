import React from 'react';
import classNames from 'classnames';

import ProgressLoadingBar from '../ProgressLoadingBar';
import { Icons } from '../Icons';
/**
 *  A React component that renders a loading indicator.
 * if progress is not provided, it will render an infinite loading indicator
 * if progress is provided, it will render a progress bar
 * Optionally a textBlock can be provided to display a message
 * Optionally a logo can be provided to display instead of the OHIF mark
 */
function LoadingIndicatorProgress({ className, textBlock, progress, logo }) {
  return (
    <div
      className={classNames(
        'absolute top-0 left-0 z-50 flex flex-col items-center justify-center space-y-5',
        className
      )}
    >
      {/* Logo or default OHIF mark */}
      {logo ? (
        <img 
          src={logo} 
          alt="Hospital Logo" 
          className="h-16 w-auto max-w-xs object-contain"
        />
      ) : (
        <Icons.LoadingOHIFMark className="h-12 w-12 text-white" />
      )}
      
      {/* Loading spinner animation */}
      <div className="flex flex-col items-center space-y-3">
        <div className="flex items-center justify-center space-x-1">
          <div className="h-2 w-2 rounded-full bg-primary loading-dot" style={{ animationDelay: '0s' }} />
          <div className="h-2 w-2 rounded-full bg-primary loading-dot" style={{ animationDelay: '0.2s' }} />
          <div className="h-2 w-2 rounded-full bg-primary loading-dot" style={{ animationDelay: '0.4s' }} />
        </div>
        
        {/* Progress bar */}
        <div className="w-48">
          <ProgressLoadingBar progress={progress} />
        </div>
      </div>
      
      {textBlock}
    </div>
  );
}

export default LoadingIndicatorProgress;
