export const Loading = () => {
  return (
    <div className="mm-loading" role="status" aria-label="Loading">
      <span className="mm-loading__dots" aria-hidden="true">
        <span className="mm-loading__dot" />
        <span className="mm-loading__dot" />
        <span className="mm-loading__dot" />
      </span>
    </div>
  );
};

export default Loading;
