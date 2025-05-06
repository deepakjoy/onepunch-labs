import React from 'react';

interface KeyParameter {
  name: string;
  weight: number;
  satisfied: boolean;
}

interface JudgeInfo {
  id: string;
  name: string;
  convictionLevel: number;
  isOut: boolean;
  inNegotiation: boolean;
  currentOffer: number | null;
  keyParameters?: KeyParameter[];
}

interface JudgesTableProps {
  judges: JudgeInfo[];
}

export const JudgesTable: React.FC<JudgesTableProps> = ({ judges }) => {
  return (
    <div className="mb-6 overflow-hidden bg-white shadow rounded-lg">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Judge</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Conviction</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Key Parameters</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {judges.map(judge => (
            <tr key={judge.id}>
              <td className="px-3 py-2 text-sm font-medium">{judge.name}</td>
              <td className="px-3 py-2 text-sm">
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div 
                    className={`h-2.5 rounded-full ${judge.convictionLevel > 70 ? 'bg-green-600' : judge.convictionLevel > 30 ? 'bg-blue-600' : 'bg-red-600'}`}
                    style={{width: `${judge.convictionLevel}%`}}
                  ></div>
                </div>
                <span className="text-xs text-gray-500">{judge.convictionLevel}%</span>
              </td>
              <td className="px-3 py-2 text-sm">
                {judge.isOut ? '🚫 Out' : 
                 judge.inNegotiation ? '💰 Deal' : 
                 judge.currentOffer ? `$${judge.currentOffer}` : '⏳ Listening'}
              </td>
              <td className="px-3 py-2 text-xs">
                {judge.keyParameters ? (
                  <div className="space-y-1">
                    {judge.keyParameters.map((param, idx) => (
                      <div key={idx} className="flex items-center">
                        <span className={`w-2 h-2 rounded-full mr-1 ${param.satisfied ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                        <span className="capitalize">{param.name.replace(/_/g, ' ')}</span>
                        <span className="ml-1 text-gray-400">({param.weight}%)</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-400">No data</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};