package com.hospital.management.ui.patients

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.RecyclerView
import com.hospital.management.data.models.Patient
import com.hospital.management.databinding.ItemPatientBinding
import java.text.SimpleDateFormat
import java.util.Locale

class PatientAdapter(
    private var patients: List<Patient>,
    private val onPatientClick: (Patient) -> Unit
) : RecyclerView.Adapter<PatientAdapter.PatientViewHolder>(), android.widget.Filterable {

    private var patientsFiltered: List<Patient> = patients

    fun updateList(newPatients: List<Patient>) {
        val diffCallback = PatientDiffCallback(patientsFiltered, newPatients)
        val diffResult = DiffUtil.calculateDiff(diffCallback)
        patients = newPatients
        patientsFiltered = newPatients
        diffResult.dispatchUpdatesTo(this)
    }

    override fun getFilter(): android.widget.Filter {
        return object : android.widget.Filter() {
            override fun performFiltering(constraint: CharSequence?): FilterResults {
                val charString = constraint?.toString() ?: ""
                patientsFiltered = if (charString.isEmpty()) {
                    patients
                } else {
                    patients.filter { row ->
                        row.patientName.lowercase().contains(charString.lowercase()) ||
                            row.medicalRecordNumber.contains(charString)
                    }
                }
                val filterResults = FilterResults()
                filterResults.values = patientsFiltered
                return filterResults
            }

            @Suppress("UNCHECKED_CAST")
            override fun publishResults(constraint: CharSequence?, results: FilterResults?) {
                val old = patientsFiltered
                val new = results?.values as? List<Patient> ?: emptyList()
                val diffResult = DiffUtil.calculateDiff(PatientDiffCallback(old, new))
                patientsFiltered = new
                diffResult.dispatchUpdatesTo(this@PatientAdapter)
            }
        }
    }

    inner class PatientViewHolder(private val binding: ItemPatientBinding) :
        RecyclerView.ViewHolder(binding.root) {

        fun bind(patient: Patient) {
            binding.tvPatientName.text = patient.patientName
            binding.tvMrn.text = "MRN: ${patient.medicalRecordNumber}"
            binding.tvPhone.text = patient.phone

            binding.tvInitials.text = if (patient.patientName.isNotEmpty()) {
                patient.patientName.first().toString().uppercase()
            } else {
                "?"
            }

            binding.root.setOnClickListener {
                onPatientClick(patient)
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): PatientViewHolder {
        val binding = ItemPatientBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false
        )
        return PatientViewHolder(binding)
    }

    override fun onBindViewHolder(holder: PatientViewHolder, position: Int) {
        holder.bind(patientsFiltered[position])
    }

    override fun getItemCount() = patientsFiltered.size

    private class PatientDiffCallback(
        private val oldList: List<Patient>,
        private val newList: List<Patient>
    ) : DiffUtil.Callback() {
        override fun getOldListSize() = oldList.size
        override fun getNewListSize() = newList.size
        override fun areItemsTheSame(oldPos: Int, newPos: Int) =
            oldList[oldPos]._id == newList[newPos]._id
        override fun areContentsTheSame(oldPos: Int, newPos: Int) =
            oldList[oldPos] == newList[newPos]
    }
}
