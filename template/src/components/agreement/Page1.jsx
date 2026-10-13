import { AGREEMENT_COMPANY, BLANK } from './agreementData.js';

export const Page1 = ({ data, fontSizeClass = 'text-[17px]' }) => {
  const getHighlightStyle = () => ({
    backgroundColor: data.showHighlights ? data.highlightColor : 'transparent',
    paddingLeft: '2px',
    paddingRight: '2px',
    borderRadius: '2px',
  });

  return (
    <div className={`doc-page font-sans leading-relaxed text-slate-900 bg-white shadow-md print:shadow-none mx-auto relative ${fontSizeClass}`}>
      {/* Document Top Title Section */}
      <div className="text-center mb-6 space-y-3">
        <p className="text-center text-xs font-semibold tracking-wide text-slate-800">Annexure 2</p>
        
        <h1 className="font-bold text-sm md:text-base leading-snug px-6 max-w-2xl mx-auto">
          Model Draft Agreement between Consumer & Vendor for installation of grid connected rooftop solar (RTS) project under PM – Surya Ghar: Muft Bijli Yojana
        </h1>
      </div>

      {/* Execution Date Intro */}
      <div className="mb-6">
        <p className="text-justify font-normal">
          This agreement is executed on{' '}
          <span className="font-normal" style={getHighlightStyle()}>
            {data.executionDate || BLANK}
          </span>{' '}
          for design, supply, installation, commissioning and 5-year comprehensive maintenance of RTS project/system along with warranty under PM Surya Ghar: Muft Bijli Yojana
        </p>
      </div>

      {/* Parties Section */}
      <div className="space-y-4 mb-6">
        <div className="text-center font-bold underline">Between</div>

        <p className="text-justify font-normal">
          <span className="font-normal" style={getHighlightStyle()}>
            {data.consumerName || BLANK}
          </span>{' '}
          ,Consumer No-{' '}
          <span className="font-normal" style={getHighlightStyle()}>
            {data.consumerNo || BLANK}
          </span>{' '}
          having address at Vill{' '}
          <span className="font-normal" style={getHighlightStyle()}>
            {data.village || BLANK}
          </span>
          ,Tal:{' '}
          <span className="font-normal" style={getHighlightStyle()}>
            {data.taluka || BLANK}
          </span>{' '}
          Dist:{' '}
          <span className="font-normal" style={getHighlightStyle()}>
            {data.district || BLANK}
          </span>{' '}
          (hereinafter referred to as first Party i.e. /consumer/consumer/purchaser /owner of system).
        </p>

        <div className="text-center font-bold">And</div>

        <p className="text-justify font-normal">
          <span className="font-normal">
            {AGREEMENT_COMPANY.name}
          </span>{' '}
          having registered office at{' '}
          <span className="font-normal underline">
            {AGREEMENT_COMPANY.address}
          </span>{' '}
          (hereinafter referred to as second Party i.e. Vendor/ contractor/ System Integrator).
        </p>
      </div>

      {/* Recitals / Whereas Clauses */}
      <div className="space-y-4 mb-8">
        <div>
          <h2 className="font-bold mb-1">Whereas</h2>
          <p className="text-justify">
            First Party wishes to install a Grid Connected Rooftop Solar Plant on the rooftop of the residential building of the Consumer under PM Surya Ghar: Muft Bijli Yojana.
          </p>
        </div>

        <div>
          <h2 className="font-bold mb-1">And whereas</h2>
          <p className="text-justify">
            Second Party has verified availability of appropriate roof and found it feasible to install a Grid Connected Roof Top Solar plant and that the second party is willing to design, supply, install, test, commission and carry out Operation & Maintenance of the Rooftop Solar plant for 5 year period
          </p>
        </div>

        <p className="text-justify pt-2">
          On this day, the First Party and Second Party agree to the following:
        </p>

        <div className="pt-4">
          <p className="font-bold underline text-justify">
            The First Party hereby undertakes to perform the following activities:
          </p>
        </div>
      </div>

      {/* Page Footer */}
      <div className="absolute bottom-5 left-10 right-10 flex items-end justify-between pt-2 text-[10px] text-black font-sans">
        <div className="flex-1 text-center pr-4">
          <div>Guidelines for PM-Surya Ghar: Muft Bijli Yojana</div>
          <div>Central Financial Assistance to Residential Consumers</div>
        </div>
        <span className="font-normal text-xs text-black flex-shrink-0">22</span>
      </div>
    </div>
  );
};
