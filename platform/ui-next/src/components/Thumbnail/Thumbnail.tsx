import React, { useEffect, useState } from 'react';
import classnames from 'classnames';
import { useDrag } from 'react-dnd';
import { Icons } from '../Icons';
import { DisplaySetMessageListTooltip } from '../DisplaySetMessageListTooltip';
import { TooltipTrigger, TooltipContent, Tooltip } from '../Tooltip';

const DraggableThumbnailContent = ({ dragData, children }: any) => {
  const [, drag] = useDrag({
    type: 'displayset',
    item: { ...dragData },
    canDrag: function () {
      return Object.keys(dragData).length !== 0;
    },
  });

  return (
    <div
      ref={drag}
      className="h-full w-full"
    >
      {children}
    </div>
  );
};

const StaticThumbnailContent = ({ children }: any) => {
  return <div className="h-full w-full">{children}</div>;
};

/**
 * Display a thumbnail for a display set.
 */
const Thumbnail = ({
  displaySetInstanceUID,
  className,
  children,
  imageSrc,
  imageAltText,
  description,
  seriesNumber,
  numInstances,
  details,
  loadingProgress,
  countIcon,
  messages,
  isActive,
  onClick,
  onDoubleClick,
  thumbnailType,
  modality,
  viewPreset = 'thumbnails',
  isHydratedForDerivedDisplaySet = false,
  isTracked = false,
  canReject = false,
  dragData = {},
  isDraggable = true,
  onReject = () => {},
  onClickUntrack = () => {},
  ThumbnailMenuItems = () => {},
  onImageLoadError = () => {},
}: withAppTypes): React.ReactNode => {
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setImageLoadFailed(false);
    setImageLoaded(false);
  }, [imageSrc]);

  const isLoading = typeof loadingProgress === 'number' && loadingProgress > 0 && loadingProgress < 1;

  const shouldRenderThumbnailImage = Boolean(imageSrc && !imageLoadFailed);

  /**
   * The detail line under the description. `details` comes from the
   * `studyBrowser.thumbnailDetails` customization, resolved by the panel; the
   * series number and instance count below are the same two items the default
   * customization declares, kept here so the component still stands alone.
   */
  const renderDetails = (textClass: string, firstItemClass?: string) => {
    // `??`, not `|| `: an unset `details` means no customization was resolved
    // for this thumbnail and the defaults below stand in, whereas an empty
    // `details` is a customization that resolved to no items at all and is
    // honoured as the empty line it asks for.
    const items = details ?? [
      { id: 'SeriesNumber', label: 'S:', value: seriesNumber },
      { id: 'InstanceCount', iconName: countIcon || 'InfoSeries', value: numInstances },
    ];

    return (
      <div className="flex h-[12px] items-center gap-[7px] overflow-hidden">
        {items.map(({ id, label, title, value, iconName }, index) => (
          <div
            key={id ?? index}
            className={classnames(
              'text-muted-foreground',
              textClass,
              index === 0 && firstItemClass
            )}
            title={title || undefined}
            data-cy={`thumbnail-detail-${id}`}
          >
            <div className="flex items-center gap-[4px]">
              {iconName &&
                React.createElement(Icons[iconName] || Icons.MissingIcon, { className: 'w-3' })}
              <div>
                {label}
                {value}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const handleTouchEnd = e => {
    // On mobile a single tap is sufficient to load the series into the viewport.
    onDoubleClick(e);
  };

  const renderThumbnailPreset = () => {
    return (
      <div
        className={classnames(
          'flex h-full w-full flex-col items-center justify-center gap-[2px] p-[4px]'
        )}
      >
        <div className="h-[80px] w-[98px] md:h-[96px] md:w-[112px] lg:h-[114px] lg:w-[128px]">
          <div className="relative overflow-hidden rounded-md bg-black">
            {shouldRenderThumbnailImage ? (
              <>
                {!imageLoaded && (
                  <div className="px-skeleton absolute inset-0 rounded-md" aria-hidden />
                )}
                <img
                  src={imageSrc}
                  alt={imageAltText}
                  className={classnames(
                    'h-[80px] w-[98px] rounded-md object-contain transition-[opacity,transform] duration-300 ease-out md:h-[96px] md:w-[112px] lg:h-[114px] lg:w-[128px]',
                    imageLoaded ? 'opacity-100' : 'opacity-0',
                    isDraggable && 'motion-safe:group-hover:scale-[1.03]'
                  )}
                  crossOrigin="anonymous"
                  onLoad={() => setImageLoaded(true)}
                  onError={() => {
                    setImageLoadFailed(true);
                    onImageLoadError();
                  }}
                />
              </>
            ) : (
              <div
                className={classnames(
                  'h-[80px] w-[98px] rounded-md md:h-[96px] md:w-[112px] lg:h-[114px] lg:w-[128px]',
                  children ? 'bg-background' : 'px-skeleton'
                )}
              >
                {children}
              </div>
            )}

            {/* download progress of the series */}
            {isLoading && (
              <div
                className="absolute inset-x-0 bottom-0 h-[3px] bg-black/50"
                role="progressbar"
                aria-label="Descargando la serie"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(loadingProgress * 100)}
              >
                <div
                  className="bg-highlight h-full transition-[width] duration-300 ease-out"
                  style={{ width: `${Math.round(loadingProgress * 100)}%` }}
                />
              </div>
            )}

            {/* bottom left */}
            <div className="absolute bottom-[4px] left-[4px] flex h-[18px] items-center gap-[4px] rounded-md bg-black/60 px-[6px] backdrop-blur-sm">
              <div
                className={classnames(
                  'h-[8px] w-[8px] rounded-full',
                  isActive || isHydratedForDerivedDisplaySet ? 'bg-highlight' : 'bg-primary/65',
                  loadingProgress && loadingProgress < 1 && 'bg-primary/25'
                )}
              ></div>
              <div
                className="text-foreground text-[11px] font-semibold"
                data-cy="series-modality-label"
              >
                {modality}
              </div>
            </div>

            {/* top right */}
            <div className="absolute top-0 right-0 flex items-center gap-[4px]">
              <DisplaySetMessageListTooltip
                messages={messages}
                id={`display-set-tooltip-${displaySetInstanceUID}`}
              />
              {isTracked && (
                <Tooltip>
                  <TooltipTrigger>
                    <div className="group">
                      <Icons.StatusTracking className="text-highlight h-[15px] w-[15px] group-hover:hidden" />
                      <Icons.Cancel
                        className="text-highlight hidden h-[15px] w-[15px] group-hover:block"
                        onClick={onClickUntrack}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <div className="flex flex-1 flex-row">
                      <div className="flex-2 flex items-center justify-center pr-4">
                        <Icons.InfoLink className="text-primary" />
                      </div>
                      <div className="flex flex-1 flex-col">
                        <span>
                          <span className="text-foreground">
                            {isTracked ? 'Serie con seguimiento' : 'Serie sin seguimiento'}
                          </span>
                        </span>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            {/* bottom right */}
            <div className="absolute bottom-0 right-0 flex items-center gap-[4px] p-[4px]">
              {/* null when the menu customization has no items */}
              {ThumbnailMenuItems && (
                <ThumbnailMenuItems
                  displaySetInstanceUID={displaySetInstanceUID}
                  canReject={canReject}
                  onReject={onReject}
                />
              )}
            </div>
          </div>
        </div>
        <div className="flex h-[46px] w-[98px] flex-col justify-start gap-[2px] pt-[3px] md:h-[50px] md:w-[112px] lg:h-[52px] lg:w-[128px]">
          <Tooltip>
            <TooltipContent>{description}</TooltipContent>
            <TooltipTrigger>
              <div
                style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                className="text-foreground min-h-[18px] w-[98px] overflow-hidden break-words pb-0.5 pl-1 text-left text-[11px] font-medium leading-[14px] md:w-[112px] lg:w-[128px] lg:text-[12px] lg:leading-4"
                data-cy="series-description-label"
              >
                {description}
              </div>
            </TooltipTrigger>
          </Tooltip>
          {renderDetails('text-[11px]', 'pl-1')}
        </div>
      </div>
    );
  };

  const renderListPreset = () => {
    return (
      <div
        className={classnames(
          'flex h-full w-full items-center justify-between pr-[8px] pl-[8px] pt-[4px] pb-[4px]'
        )}
      >
        <div className="relative flex h-[32px] w-full items-center gap-[8px] overflow-hidden">
          <div
            className={classnames(
              'h-[32px] w-[4px] min-w-[4px] rounded',
              isActive || isHydratedForDerivedDisplaySet ? 'bg-highlight' : 'bg-primary/65',
              loadingProgress && loadingProgress < 1 && 'bg-primary/25'
            )}
          ></div>
          <div className="flex h-full w-[calc(100%-12px)] flex-col justify-start">
            <div className="flex items-center gap-[7px]">
              <div
                className="text-foreground text-[13px] font-semibold"
                data-cy="series-modality-label"
              >
                {modality}
              </div>
              <Tooltip>
                <TooltipContent>{description}</TooltipContent>
                <TooltipTrigger className="w-full overflow-hidden">
                  <div
                    className="text-foreground max-w-[160px] overflow-hidden overflow-ellipsis whitespace-nowrap text-left text-[13px] font-normal"
                    data-cy="series-description-label"
                  >
                    {description}
                  </div>
                </TooltipTrigger>
              </Tooltip>
            </div>

            {renderDetails('text-[12px]')}
          </div>
        </div>
        <div className="flex h-full items-center gap-[4px]">
          <DisplaySetMessageListTooltip
            messages={messages}
            id={`display-set-tooltip-${displaySetInstanceUID}`}
          />
          {isTracked && (
            <Tooltip>
              <TooltipTrigger>
                <div className="group">
                  <Icons.StatusTracking className="text-highlight h-[20px] w-[15px] group-hover:hidden" />
                  <Icons.Cancel
                    className="text-highlight hidden h-[15px] w-[15px] group-hover:block"
                    onClick={onClickUntrack}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                <div className="flex flex-1 flex-row">
                  <div className="flex-2 flex items-center justify-center pr-4">
                    <Icons.InfoLink className="text-primary" />
                  </div>
                  <div className="flex flex-1 flex-col">
                    <span>
                      <span className="text-foreground">
                        {isTracked ? 'Serie con seguimiento' : 'Serie sin seguimiento'}
                      </span>
                    </span>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          )}
          {ThumbnailMenuItems && (
            <ThumbnailMenuItems
              displaySetInstanceUID={displaySetInstanceUID}
              canReject={canReject}
              onReject={onReject}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className={classnames(
        className,
        'bg-muted/70 group flex flex-shrink-0 select-none flex-col rounded-lg outline-none ring-offset-0 transition-[background-color,box-shadow,transform] duration-150 ease-out',
        'focus-visible:ring-primary focus-visible:ring-2',
        isActive ? 'bg-popover ring-highlight shadow-lg shadow-black/40 ring-2' : 'ring-1 ring-transparent',
        isDraggable && !isActive && 'hover:bg-accent/80 hover:ring-primary/40 cursor-pointer motion-safe:hover:-translate-y-px',
        isDraggable && isActive && 'cursor-pointer',
        !isDraggable && 'cursor-default',
        viewPreset === 'thumbnails' &&
          'h-[130px] w-[105px] md:h-[150px] md:w-[120px] lg:h-[170px] lg:w-[135px]',
        viewPreset === 'list' && 'h-[40px] w-full'
      )}
      id={`thumbnail-${displaySetInstanceUID}`}
      data-cy={
        thumbnailType === 'thumbnailNoImage'
          ? 'study-browser-thumbnail-no-image'
          : 'study-browser-thumbnail'
      }
      data-series={seriesNumber}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onTouchEnd={handleTouchEnd}
      role={isDraggable ? 'button' : undefined}
      tabIndex={isDraggable ? 0 : undefined}
      aria-pressed={isDraggable ? !!isActive : undefined}
      aria-label={[modality, description].filter(Boolean).join(' · ') || undefined}
      onKeyDown={
        isDraggable
          ? e => {
              // Enter or space loads the series in the active viewport, like a double click
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onDoubleClick(e);
              }
            }
          : undefined
      }
    >
      {isDraggable ? (
        <DraggableThumbnailContent dragData={dragData}>
          {viewPreset === 'thumbnails' && renderThumbnailPreset()}
          {viewPreset === 'list' && renderListPreset()}
        </DraggableThumbnailContent>
      ) : (
        <StaticThumbnailContent>
          {viewPreset === 'thumbnails' && renderThumbnailPreset()}
          {viewPreset === 'list' && renderListPreset()}
        </StaticThumbnailContent>
      )}
    </div>
  );
};



export { Thumbnail };
